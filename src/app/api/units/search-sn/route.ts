// src/app/api/units/search-sn/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth } from "@/lib/auth";
import { PREPARATION_CREATE_ROLES } from "@/lib/permissions";

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
            // (SOLD/RESERVED/HELD/PACKING) tidak ditampilkan. "Sedang dipakai
            // di penyiapan lain" TIDAK LAGI dibaca dari status unit —
            // Penyiapan tidak pernah mengubah laptop_units.status sama
            // sekali — dihitung terpisah lewat preparation_items aktif
            // (lihat blok activeInPrepIds di bawah).
            .eq("status", "SIAP_JUAL")
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
   const laptopFormatted = (laptopResult.data || []).map((u: any) => ({
        id: u.id,
        serial_number: u.serial_number,
        grade: u.grade,
        purchase_price: u.purchase_price ?? 0,
        selling_price: u.selling_price ?? 0,
        condition_note: u.condition_note ?? "",
        status: u.status,
        laptop_id: u.laptops?.id ?? "",
        laptop_name: u.laptops?.laptop_name ?? "",
        // Penanda tipe — dipakai di frontend untuk render berbeda
        unit_type: "laptop" as const,
        // True kalau unit ini SEDANG dipakai di penyiapan lain yang masih
        // aktif (lihat query activeInPrepIds di atas) — dipakai FE untuk
        // kasih hint visual, bukan untuk memblokir apapun.
        in_other_preparation: activeInPrepIds.has(u.id),
    }));

    // ── Format accessory units ────────────────────────────────────────────────
    const accessoryFormatted = (accessoryResult.data || []).map((u: any) => {
        const acc = u.accessories;
        // Buat display_name yang representatif (mirip format laptop)
        const displayName = [acc?.name, acc?.brand, acc?.spec]
            .filter(Boolean).join(" ");
        return {
            id: u.id,
            serial_number: u.serial_number,
            grade: null,                        // aksesori tidak punya grade
            purchase_price: u.buy_price ?? 0,
            selling_price: u.selling_price ?? 0,
            condition_note: u.notes ?? "",
            status: u.status,
            laptop_id: acc?.id ?? "",           // diisi accessory_id supaya konsisten
            laptop_name: displayName,           // diisi display name aksesori
            // Data tambahan khusus aksesori
            unit_type: "accessory" as const,
            accessory_id: acc?.id ?? "",
            accessory_name: acc?.name ?? "",
            category: acc?.category ?? "",
            condition: u.condition,             // BARU | BEKAS
        };
    });

    // ── Merge, laptop dulu kemudian aksesori, total max 10 ───────────────────
    const merged = [...laptopFormatted, ...accessoryFormatted].slice(0, 10);

    return NextResponse.json({ data: merged });
}, PREPARATION_CREATE_ROLES);