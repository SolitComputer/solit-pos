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

// ─── POST /api/laptops/sparepart-queue ──────────────────────────────────
// Tambah 1 sparepart ke unit yang SUDAH di antrian (qc_status='IN_SPAREPART').
// Body: { unit_id, sparepart_name, estimasi_harga?, catatan? }
async function postHandler(req: NextRequest, _ctx: unknown, user: AuthUser) {
  try {
    const body = await req.json();
    const { unit_id, sparepart_name, estimasi_harga, catatan } = body;

    if (!unit_id || typeof unit_id !== "string") {
      return NextResponse.json({ success: false, message: "unit_id wajib" }, { status: 400 });
    }
    if (!sparepart_name || typeof sparepart_name !== "string" || !sparepart_name.trim()) {
      return NextResponse.json({ success: false, message: "Nama sparepart wajib diisi" }, { status: 400 });
    }

    // Guard: unit harus di antrian (IN_SPAREPART)
    const { data: unit, error: fetchErr } = await supabase
      .from("laptop_units")
      .select("id, laptop_id, qc_status")
      .eq("id", unit_id)
      .single();
    if (fetchErr || !unit) {
      return NextResponse.json({ success: false, message: "Unit tidak ditemukan" }, { status: 404 });
    }
    if (unit.qc_status !== "IN_SPAREPART") {
      return NextResponse.json({
        success: false,
        message: `Unit ini bukan di antrian sparepart (qc_status: ${unit.qc_status ?? "—"})`,
      }, { status: 400 });
    }

    const { data, error } = await supabase.from("sparepart_queue").insert({
      unit_id,
      laptop_id: unit.laptop_id,
      sparepart_name: sparepart_name.trim(),
      estimasi_harga: estimasi_harga != null && estimasi_harga !== ""
        ? Math.round(Number(estimasi_harga)) : null,
      catatan: catatan?.trim() || null,
      created_by: user.id,
    }).select().single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[sparepart-queue POST]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, PENGELOLA_DECISION_ROLES);
export const POST = withAuth(postHandler, PENGELOLA_DECISION_ROLES);