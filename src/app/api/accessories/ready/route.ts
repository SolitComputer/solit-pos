// src/app/api/accessories/ready/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { LAPTOP_READY_VIEW_ROLES } from "@/lib/permissions";

// Kategori aksesoris yang boleh tampil di halaman Barang Siap Jual.
// Dibatasi HDD, RAM & SSD sesuai requirement — kategori lain tidak muncul di sini.
const READY_ACCESSORY_CATEGORIES = ["HDD", "RAM", "SSD"];

async function handler(_req: NextRequest, _ctx: any, _user: AuthUser) {
    try {
        // Ambil aksesoris + status tiap unit-nya. Kita TIDAK ambil buy_price
        // sama sekali — halaman ini untuk sales, cukup harga jual + stok.
        const { data, error } = await supabaseAdmin
            .from("accessories")
            .select("id, name, category, sell_price, stock, archived_at, accessory_units(status)")
            .order("name", { ascending: true });

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 400 });
        }

        const rows = (data ?? [])
            // Barang terarsip tidak dihitung (konsisten dengan Data Barang).
            .filter((a: any) => !a.archived_at)
            // Hanya HDD & RAM — perbandingan di-uppercase biar kebal beda kapital.
            .filter((a: any) =>
                READY_ACCESSORY_CATEGORIES.includes(String(a.category ?? "").trim().toUpperCase())
            )
            .map((a: any) => {
                const units = a.accessory_units ?? [];
                // Stok = jumlah unit berstatus TERSEDIA (Siap Jual). Kalau aksesoris
                // lama belum punya unit ber-SN, fallback ke kolom stock manual —
                // pola yang sama dipakai normalizeAccessory di Data Barang.
                const stok = units.length > 0
                    ? units.filter((u: any) => u.status === "TERSEDIA").length
                    : (a.stock ?? 0);
                return {
                    id: a.id,
                    name: a.name,
                    category: a.category,
                    sell_price: Math.round(Number(a.sell_price) || 0),
                    stok,
                };
            })
            // Hanya tampilkan yang stoknya > 0 — sama semangat dengan laptop (qty > 0).
            .filter((r: any) => r.stok > 0);

        return NextResponse.json({ success: true, data: rows });
    } catch {
        return NextResponse.json({ success: false }, { status: 500 });
    }
}

export const GET = withAuth(handler, LAPTOP_READY_VIEW_ROLES);