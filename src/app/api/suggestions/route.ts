import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import type { UserRole } from "@/lib/permissions";

/**
 * Whitelist field yang boleh di-query untuk saran autocomplete.
 * Dipakai untuk:
 *  1. Mencegah SQL injection via query param
 *  2. Limit scope ke field teks yang memang masuk akal di-autocomplete
 *
 * Field shared (source, condition_note) ambil dari beberapa tabel sekaligus
 * biar saran "Bu Reta" muncul baik di form laptop maupun aksesoris.
 */
const FIELD_CONFIG: Record<string, { table: string; column: string }[]> = {
  source: [
    { table: "laptop_units", column: "source" },
    { table: "accessory_units", column: "source" },
  ],
  condition_note: [
    { table: "laptop_units", column: "condition_note" },
  ],
  brand: [{ table: "laptops", column: "brand" }],
  cpu: [{ table: "laptops", column: "cpu" }],
  ram: [{ table: "laptops", column: "ram" }],
  storage: [{ table: "laptops", column: "storage" }],
  laptop_name: [{ table: "laptops", column: "laptop_name" }],
  grade: [{ table: "laptop_units", column: "grade" }],
};

async function handler(req: NextRequest, _ctx: unknown, _user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const field = searchParams.get("field");

    if (!field || !FIELD_CONFIG[field]) {
      return NextResponse.json(
        { success: false, message: `Field tidak dikenal: ${field}` },
        { status: 400 }
      );
    }

    // Ambil banyak baris dari tiap sumber, dedupe + hitung frekuensi di JS.
    // Simple approach — tidak pakai RPC. Limit 500 per sumber sudah cukup
    // buat skala DB Solit (ribuan unit), dan JS cepat untuk dedupe segini.
    const sources = FIELD_CONFIG[field];
    const all: string[] = [];

    for (const src of sources) {
      const { data } = await supabase
        .from(src.table)
        .select(src.column)
        .not(src.column, "is", null)
        .limit(500);

      // Cast via unknown dulu karena Supabase infer tipe `data` sebagai
      // GenericStringError[] saat nama kolom dinamis — nggak bisa langsung
      // di-cast ke Record<string, unknown>[] tanpa lewat unknown.
      for (const row of ((data ?? []) as unknown as Array<Record<string, unknown>>)) {
        const v = row[src.column];
        if (typeof v === "string" && v.trim() !== "") {
          all.push(v.trim());
        }
      }
    }

    // Dedupe + hitung frekuensi (makin sering dipakai → makin atas).
    const counts = new Map<string, number>();
    for (const v of all) {
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }

    // Sort by frekuensi desc, ambil top 50.
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([v]) => v);

    return NextResponse.json({ success: true, data: sorted });
  } catch {
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}

// Permission: semua role yang bisa akses Data Barang / Kelola Unit / Team QC.
// Data yang di-return cuma nilai distinct yang sudah public di halaman mereka.
const ALLOWED_ROLES: UserRole[] = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "KEPALA_ADMIN_BARANG", "ADMIN_BARANG", "PKL_ADMIN_BARANG",
  "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "PKL_PENGELOLA_BARANG",
  "KEPALA_TEKNISI", "TEKNISI", "ACCOUNTING",
];

export const GET = withAuth(handler, ALLOWED_ROLES);