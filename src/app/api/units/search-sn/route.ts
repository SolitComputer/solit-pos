// src/app/api/units/search-sn/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth } from "@/lib/auth";
import { PREPARATION_CREATE_ROLES, PREPARATION_DONE_ROLES, ITEM_OUTFLOW_ROLES } from "@/lib/permissions";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ✅ SECURITY FIX: dulu endpoint ini tanpa cek role sama sekali (tidak ada di
// ROUTE_PERMISSIONS → middleware meloloskan SEMUA role login), padahal
// responsnya menyertakan harga modal (purchase_price/buy_price). Dibatasi ke
// role yang memang melakukan pencarian SN (sales + penyiapan + full access),
// jadi role tak terkait (kebersihan, pengantaran, PKL non-sales) tidak lagi
// bisa mengintip harga modal.
export const GET = withAuth(async (req: NextRequest) => {
    const q = req.nextUrl.searchParams.get("q") || "";

    if (q.length < 2) {
        return NextResponse.json({ data: [] });
    }

    const [laptopResult, accessoryResult] = await Promise.all([
        supabase
            .from("laptop_units")
            .select(`
                    id,
                    serial_number,
                    grade,
                    purchase_price,
                    selling_price,
                    condition_note,
                    status,
                    laptops (
                        id,
                        laptop_name,
                        charger_price,
                        laptop_bag_price
                    )
                `)
            .ilike("serial_number", `%${q}%`)
            // Unit yang statusnya sudah terjual/diproses via jalur transaksi
            // (SOLD/RESERVED/HELD/PACKING) tidak ditampilkan — sisanya
            // (SIAP_JUAL, BELUM_SIAP, DEAD, dll) tetap muncul di search.
            // Dulu di sini pakai .eq("status","SIAP_JUAL") yang salah:
            // itu whitelist HANYA 1 status, jadi unit valid dgn status
            // lain (mis. BELUM_SIAP) hilang dari search walau masih ada
            // di Data Barang. "Sedang dipakai di penyiapan lain" TIDAK
            // LAGI dibaca dari status unit — Penyiapan tidak pernah
            // mengubah laptop_units.status sama sekali — dihitung
            // terpisah lewat preparation_items aktif (lihat blok
            // activeInPrepIds di bawah).
            .not("status", "in", "(SOLD,RESERVED,HELD,PACKING)")
            .limit(8)
            .order("serial_number"),

        supabase
            .from("accessory_units")
            .select(`
                    id,
                    serial_number,
                    condition,
                    buy_price,
                    selling_price,
                    status,
                    notes,
                    accessories (
                        id,
                        name,
                        category,
                        brand,
                        spec
                    )
                `)
            .ilike("serial_number", `%${q}%`)
            .eq("status", "TERSEDIA")
            .limit(8)
            .order("serial_number"),
    ]);

    if (laptopResult.error) console.error("search-sn laptop error:", laptopResult.error);
    if (accessoryResult.error) console.error("search-sn accessory error:", accessoryResult.error);

    // ── Cek unit mana yang SEDANG dipakai di penyiapan lain yang masih aktif ──
    // Business rule: SN yang sama boleh dipakai di lebih dari 1 penyiapan
    // sekaligus — ini murni informasi/hint buat sales, BUKAN pembatas. Karena
    // laptop_units.status tidak lagi berubah saat Penyiapan dibuat, deteksinya
    // sekarang lewat preparation_items yang masih aktif (belum dibatalkan &
    // order-nya belum SELESAI/DIBATALKAN).
    const laptopUnitIds = (laptopResult.data || []).map((u: any) => u.id);
    let activeInPrepIds = new Set<string>();
    if (laptopUnitIds.length > 0) {
        const { data: activePrepItems } = await supabase
            .from("preparation_items")
            .select("unit_id, preparation_orders!inner(status)")
            .in("unit_id", laptopUnitIds)
            .eq("is_cancelled", false)
            .in("preparation_orders.status", ["MENUNGGU", "DIPROSES", "SIAP_KIRIM", "MENUNGGU_PENGANTAR", "DIKIRIM"]);
        activeInPrepIds = new Set((activePrepItems || []).map((it: any) => it.unit_id).filter(Boolean));
    }

    // ── Format laptop units ───────────────────────────────────────────────────
    const laptopFormatted = (laptopResult.data || [])
        // FIX: unit yang master laptops-nya null (join putus / data master
        // kosong) akan menghasilkan laptop_id & laptop_name "" — yang GAGAL
        // validasi zod di form (units.laptop_id/laptop_name min(1)). Daripada
        // dikirim lalu ditolak di client dengan alert (UX jelek), disaring di
        // sini supaya tidak muncul sama sekali di dropdown.
        .filter((u: any) => {
            const ok = Boolean(u.laptops?.id) && Boolean(u.laptops?.laptop_name);
            if (!ok) console.warn("[search-sn] laptop unit tanpa master valid, dilewati:", u.serial_number);
            return ok;
        })
        .map((u: any) => ({
            id: u.id,
            serial_number: u.serial_number,
            grade: u.grade,
            purchase_price: u.purchase_price ?? 0,
            selling_price: u.selling_price ?? 0,
            condition_note: u.condition_note ?? "",
            status: u.status,
            laptop_id: u.laptops.id,
            laptop_name: u.laptops.laptop_name,
            // Penanda tipe — dipakai di frontend untuk render berbeda
            unit_type: "laptop" as const,
            // True kalau unit ini SEDANG dipakai di penyiapan lain yang masih
            // aktif (lihat query activeInPrepIds di atas) — dipakai FE untuk
            // kasih hint visual, bukan untuk memblokir apapun.
            in_other_preparation: activeInPrepIds.has(u.id),
        }));

    // ── Format accessory units ────────────────────────────────────────────────
    // FIX: sama seperti laptop di atas — unit yang master accessories-nya null
    // menghasilkan laptop_id (dari accessory_id) & laptop_name (dari displayName)
    // kosong "", yang GAGAL validasi zod (units.*.min(1)) → "units: tidak valid".
    // Saring dulu row tanpa master valid supaya tidak muncul di dropdown.
    const accessoryFormatted = (accessoryResult.data || [])
        .filter((u: any) => {
            const acc = u.accessories;
            const displayName = [acc?.name, acc?.brand, acc?.spec].filter(Boolean).join(" ");
            const ok = Boolean(acc?.id) && displayName.length > 0;
            if (!ok) console.warn("[search-sn] accessory unit tanpa master valid, dilewati:", u.serial_number);
            return ok;
        })
        .map((u: any) => {
            const acc = u.accessories;
            // Buat display_name yang representatif (mirip format laptop)
            const displayName = [acc.name, acc.brand, acc.spec]
                .filter(Boolean).join(" ");
            return {
                id: u.id,
                serial_number: u.serial_number,
                grade: null,                        // aksesori tidak punya grade
                purchase_price: u.buy_price ?? 0,
                selling_price: u.selling_price ?? 0,
                condition_note: u.notes ?? "",
                status: u.status,
                laptop_id: acc.id,                  // diisi accessory_id supaya konsisten
                laptop_name: displayName,           // diisi display name aksesori
                // Data tambahan khusus aksesori
                unit_type: "accessory" as const,
                accessory_id: acc.id,
                accessory_name: acc.name ?? "",
                category: acc.category ?? "",
                condition: u.condition,             // BARU | BEKAS
            };
        });

    // ── Merge, laptop dulu kemudian aksesori, total max 10 ───────────────────
    const merged = [...laptopFormatted, ...accessoryFormatted].slice(0, 10);

    return NextResponse.json({ data: merged });
}, Array.from(new Set([...PREPARATION_CREATE_ROLES, ...PREPARATION_DONE_ROLES, ...ITEM_OUTFLOW_ROLES])));