// src/app/api/laptops/dedup/candidates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { LAPTOP_MERGE_ROLES } from "@/lib/permissions";

// ═══════════════════════════════════════════════════════════════════════
// GET /api/laptops/dedup/candidates?source_id=X&q=searchtext
// ═══════════════════════════════════════════════════════════════════════
// Return kandidat laptop target untuk merge manual.
// Logic:
//   1. Exclude source laptop itself
//   2. Kalau source punya dedup_hash → prioritaskan yg hash sama (100% match)
//   3. Plus search text matching (nama laptop LIKE %q%) → kandidat kemungkinan
//      (user bisa review field mana yang beda sebelum merge)
//
// Response: array of laptops dengan 6 field dedup — client validasi identical
// pakai isLaptopsIdentical() dari lib/dedupHash sebelum tombol merge aktif.
async function handler(req: NextRequest, _ctx: unknown, _user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const sourceId = searchParams.get("source_id");
    const q = searchParams.get("q")?.trim() ?? "";

    if (!sourceId) {
      return NextResponse.json({ success: false, message: "source_id wajib diisi" }, { status: 400 });
    }

    // Fetch source laptop untuk dapet hash-nya
    const { data: source, error: sErr } = await supabase
      .from("laptops")
      .select("id, dedup_hash, brand, laptop_name")
      .eq("id", sourceId)
      .single();

    if (sErr || !source) {
      return NextResponse.json({ success: false, message: "Source laptop tidak ditemukan" }, { status: 404 });
    }

    // Query kandidat: exclude source, match hash ATAU match nama
    let query = supabase
      .from("laptops")
      .select("id, laptop_name, brand, cpu, ram, storage, gpu, dedup_hash, qty")
      .neq("id", sourceId)
      .limit(50);

    if (q.length >= 2) {
      // User ngetik search → match nama/brand
      query = query.or(`laptop_name.ilike.%${q}%,brand.ilike.%${q}%`);
    } else if (source.dedup_hash) {
      // Default: match hash sama (duplikat persis)
      query = query.eq("dedup_hash", source.dedup_hash);
    } else {
      // Source hash NULL (data lama) + user belum search → fallback nama+brand
      const nameQuery = (source.laptop_name ?? "").trim();
      if (nameQuery.length >= 2) {
        query = query.ilike("laptop_name", `%${nameQuery}%`);
      } else {
        return NextResponse.json({ success: true, data: [], source });
      }
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: data ?? [], source });
  } catch (err) {
    console.error("[dedup/candidates GET]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, LAPTOP_MERGE_ROLES);