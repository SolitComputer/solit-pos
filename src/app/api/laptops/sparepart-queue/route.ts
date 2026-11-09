// app/api/laptops/sparepart-queue/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PENGELOLA_DECISION_ROLES } from "@/lib/permissions";

// ─── GET /api/laptops/sparepart-queue?status=MENUNGGU ──────────────────
// List antrian sparepart. Default: ambil yg masih MENUNGGU.
async function getHandler(req: NextRequest, _ctx: unknown, _user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "MENUNGGU";

    const { data, error } = await supabase
      .from("sparepart_queue")
      .select(`
        *,
        laptop:laptops (id, laptop_name, brand),
        pic:users!sparepart_queue_pic_user_id_fkey (id, name)
      `)
      .eq("status", status)
      .order("created_at", { ascending: true }); // FIFO — antrian lama diproses dulu

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    // Join manual serial_number dari laptop_units (karena sparepart_queue.unit_id ref ke laptop_units)
    const unitIds = (data ?? []).map(d => d.unit_id);
    const unitMap = new Map<string, string>();
    if (unitIds.length > 0) {
      const { data: units } = await supabase
        .from("laptop_units")
        .select("id, serial_number")
        .in("id", unitIds);
      (units ?? []).forEach(u => unitMap.set(u.id, u.serial_number));
    }

    const enriched = (data ?? []).map(d => ({
      ...d,
      serial_number: unitMap.get(d.unit_id) ?? null,
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    console.error("[sparepart-queue GET]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, PENGELOLA_DECISION_ROLES);