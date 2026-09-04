// src/app/api/laptops/[id]/convert-to-accessory/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { BARANG_FULL_ACCESS_ROLES, hasAnyRole } from "@/lib/permissions";

// ─── POST /api/laptops/[id]/convert-to-accessory ──────────────────────────────
// Perbaikan data: barang yang ketika ditambahkan salah dipilih tipenya (mis.
// Printer dibuat lewat form Laptop, jadi field CPU/RAM/GPU kosong semua dan
// kategorinya kejebak cuma bisa "Laptop"/"Tanpa Kategori"). Endpoint ini
// memindahkan data ke tabel accessories dengan kategori yang benar, lalu
// menghapus baris laptop lama.
//
// DIBATASI hanya untuk laptop dengan 0 ATAU 1 unit aktif — lihat komentar di
// UnifiedBarangContent.tsx (tombol "Perbaiki Tipe") untuk alasannya.
async function convertHandler(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
    user: AuthUser
) {
    if (!hasAnyRole(user.roles ?? [user.role], BARANG_FULL_ACCESS_ROLES)) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: "Body tidak valid" }, { status: 400 }); }

    const { category } = body as Record<string, unknown>;
    if (!category || typeof category !== "string" || !category.trim()) {
        return NextResponse.json({ success: false, error: "Kategori tujuan wajib diisi" }, { status: 400 });
    }

    const { data: laptop, error: fetchErr } = await supabaseAdmin
        .from("laptops")
        .select("*, laptop_units(*)")
        .eq("id", id)
        .maybeSingle();

    if (fetchErr) return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 });
    if (!laptop) return NextResponse.json({ success: false, error: "Laptop tidak ditemukan" }, { status: 404 });

    const units = ((laptop as any).laptop_units ?? []) as Array<Record<string, any>>;
    const aktif = units.filter(u => u.status !== "SOLD");

    if (aktif.length > 1) {
        return NextResponse.json({
            success: false,
            error: `Barang ini punya ${aktif.length} unit aktif — kosongkan dulu lewat "Kelola Unit" sampai tersisa maksimal 1 sebelum dikonversi.`,
        }, { status: 400 });
    }

    const singleUnit = aktif[0] ?? null;

    // Gabungkan CPU/RAM/Storage/GPU/Display (kalau ada isinya) jadi 1 baris
    // teks Spek — field-field ini tidak ada padanannya di tabel accessories.
    const specParts = [laptop.cpu, laptop.ram, laptop.storage, laptop.gpu, laptop.display]
        .filter((v): v is string => typeof v === "string" && v.trim() !== "");
    const spec = specParts.length > 0 ? specParts.join(" · ") : null;

    const accessoryPayload = {
        name: laptop.laptop_name,
        category: category.trim().toUpperCase(),
        brand: laptop.brand || null,
        spec,
        buy_price: singleUnit ? Math.max(0, Number(singleUnit.purchase_price) || 0) : 0,
        sell_price: Math.max(0, Number(laptop.selling_price) || 0),
        stock: singleUnit ? 1 : 0,
        notes: laptop.notes || laptop.condition_note || null,
    };

    const { data: newAccessory, error: insertErr } = await supabaseAdmin
        .from("accessories").insert(accessoryPayload).select().single();
    if (insertErr) {
        return NextResponse.json({ success: false, error: `Gagal membuat data aksesori: ${insertErr.message}` }, { status: 500 });
    }

    // Hapus unit dulu (FK ke laptop_id), baru hapus baris laptop-nya.
    if (singleUnit) {
        await supabaseAdmin.from("laptop_units").delete().eq("id", singleUnit.id);
    }
    const { error: deleteErr } = await supabaseAdmin.from("laptops").delete().eq("id", id);
    if (deleteErr) {
        // Data aksesori BARU SUDAH TERLANJUR dibuat di titik ini. Supaya tidak
        // ada data hilang jejak, kembalikan id-nya di pesan error — baris
        // laptop lama TIDAK ikut terhapus, harus dihapus manual / coba lagi.
        return NextResponse.json({
            success: false,
            error: `Data aksesori berhasil dibuat (id: ${newAccessory.id}), tapi gagal menghapus baris laptop lama: ${deleteErr.message}. Hapus manual baris laptop ini untuk menghindari duplikat.`,
        }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: newAccessory });
}

export const POST = withAuth(convertHandler);