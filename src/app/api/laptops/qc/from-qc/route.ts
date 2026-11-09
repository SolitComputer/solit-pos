// app/api/laptops/qc/from-qc/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PENGELOLA_DECISION_ROLES } from "@/lib/permissions";

// ─── GET /api/laptops/qc/from-qc ───────────────────────────────────────
// List semua unit yang ditandai MINUS oleh Team QC (qc_status = 'FROM_QC').
// Dipakai di Tab "Dari QC" di halaman /dashboard/laptops/minus.
// Beda dengan /api/laptops/minus yang ambil semua unit BELUM_SIAP/SERVICE —
// yang ini filter spesifik: cuma unit yang muncul dari alur Team QC baru,
// yang butuh keputusan Pengelola Barang (PERBAIKI / MSJ / MATOT).
async function getHandler(_req: NextRequest, _ctx: unknown, _user: AuthUser) {
  try {
    const { data, error } = await supabase
      .from("laptop_units")
      .select(`
        *,
        laptop:laptops (
          id, laptop_name, brand, cpu, ram, storage, gpu, display
        )
      `)
      .eq("qc_status", "FROM_QC")
      .order("qc_marked_minus_at", { ascending: false }); // terbaru di atas

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    // Ambil reason terakhir dari qc_history untuk tiap unit (optional enrichment)
    const unitIds = (data ?? []).map(u => u.id);
    const historyMap = new Map<string, string>();
    if (unitIds.length > 0) {
      const { data: history } = await supabase
        .from("qc_history")
        .select("unit_id, reason")
        .in("unit_id", unitIds)
        .eq("to_qc_status", "FROM_QC")
        .order("created_at", { ascending: false });

      (history ?? []).forEach(h => {
        if (!historyMap.has(h.unit_id)) historyMap.set(h.unit_id, h.reason ?? "");
      });
    }

    const enriched = (data ?? []).map(u => ({
      ...u,
      qc_reason: historyMap.get(u.id) ?? null,
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    console.error("[from-qc GET]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, PENGELOLA_DECISION_ROLES);