import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { ITEM_LOAN_VIEW_ROLES } from "@/lib/permissions";

async function handler(req: NextRequest, _ctx: unknown, _user: AuthUser) {
  try {
    const q = (new URL(req.url).searchParams.get("q") || "").trim();
    if (q.length < 2) return NextResponse.json({ success: true, data: [] });

    const like = `%${q}%`;
    const [lap, accUnits, accParent] = await Promise.all([
      // Laptop: selalu per-unit (laptop pasti punya SN asli)
      supabase
        .from("laptop_units")
        .select("id, serial_number, status, laptop_id, laptops(laptop_name)")
        .ilike("serial_number", like)
        .not("status", "in", "(SOLD,KELUAR)")
        .limit(15),
      // ✅ FIX: Aksesoris ber-SN — TANPA embed accessories(name). Dulu pakai
      // embed `accessories(name)`; kalau relasi FK accessory_units→accessories
      // tidak kedetect PostgREST, SELURUH query ini error → acc.data null →
      // semua aksesoris hilang dari pencarian (persis gejala SN 00200 tak muncul
      // padahal laptop muncul). Nama diambil terpisah lewat accParent di bawah.
      supabase
        .from("accessory_units")
        .select("id, serial_number, status, accessory_id")
        .ilike("serial_number", like)
        .not("status", "in", "(TERJUAL,KELUAR)")
        .limit(15),
      // ✅ ADD: Aksesoris dicari lewat NAMA juga (menangkap stok manual tanpa SN,
      // dipinjam di level model → unit_id null).
      supabase
        .from("accessories")
        .select("id, name")
        .ilike("name", like)
        .limit(15),
    ]);

    // Nama aksesoris untuk unit ber-SN: query terpisah by id (hindari embed).
    const accUnitRows = accUnits.data ?? [];
    const accIds = Array.from(new Set(accUnitRows.map((u: Record<string, any>) => u.accessory_id).filter(Boolean)));
    let nameById: Record<string, string> = {};
    if (accIds.length > 0) {
      const { data: nameRows } = await supabase
        .from("accessories")
        .select("id, name")
        .in("id", accIds);
      nameById = Object.fromEntries((nameRows ?? []).map((a: Record<string, any>) => [a.id, a.name]));
    }

    // Supaya aksesoris yang SUDAH punya baris ber-SN tidak dobel muncul sebagai
    // "parent tanpa SN", kumpulkan dulu id yang sudah tampil via unit.
    const unitAccIds = new Set(accUnitRows.map((u: Record<string, any>) => u.accessory_id));

    const results = [
      ...((lap.data ?? []).map((u: Record<string, any>) => ({
        item_type: "LAPTOP" as const,
        item_id: u.laptop_id,
        unit_id: u.id,
        serial_number: u.serial_number,
        item_name: u.laptops?.laptop_name ?? "Laptop",
        status: u.status,
      }))),
      ...accUnitRows.map((u: Record<string, any>) => ({
        item_type: "AKSESORIS" as const,
        item_id: u.accessory_id,
        unit_id: u.id,
        serial_number: u.serial_number,
        item_name: nameById[u.accessory_id] ?? "Aksesoris",
        status: u.status,
      })),
      ...((accParent.data ?? [])
        .filter((a: Record<string, any>) => !unitAccIds.has(a.id))
        .map((a: Record<string, any>) => ({
          item_type: "AKSESORIS" as const,
          item_id: a.id,
          unit_id: null,
          serial_number: null,
          item_name: a.name ?? "Aksesoris",
          status: "TERSEDIA",
        }))),
    ];

    return NextResponse.json({ success: true, data: results });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, ITEM_LOAN_VIEW_ROLES);