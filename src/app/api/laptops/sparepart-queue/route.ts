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

    // Join manual ke laptop_units — selain serial_number, juga ambil field
    // identitas unit-level (laptop_name, brand) untuk hybrid read SN Lepas.
    const unitIds = (data ?? []).map(d => d.unit_id);
    const unitMap = new Map<string, {
      serial_number: string | null;
      laptop_name: string | null;
      brand: string | null;
      laptop_id: string | null;
    }>();
    if (unitIds.length > 0) {
      const { data: units } = await supabase
        .from("laptop_units")
        .select("id, serial_number, laptop_name, brand, laptop_id")
        .in("id", unitIds);
      (units ?? []).forEach(u => unitMap.set(u.id, {
        serial_number: u.serial_number,
        laptop_name: u.laptop_name,
        brand: u.brand,
        laptop_id: u.laptop_id,
      }));
    }

    const enriched = (data ?? []).map(d => {
      const unitInfo = unitMap.get(d.unit_id);
      // ✅ Hybrid read: field unit prioritas, fallback laptop (parent)
      const effectiveName =
        unitInfo?.laptop_name || d.laptop?.laptop_name || null;
      const effectiveBrand =
        unitInfo?.brand || d.laptop?.brand || null;
      return {
        ...d,
        serial_number: unitInfo?.serial_number ?? null,
        // Overwrite nested laptop dengan effective values untuk simplify frontend
        laptop: {
          ...(d.laptop ?? {}),
          laptop_name: effectiveName,
          brand: effectiveBrand,
        },
        is_sn_lepas: !unitInfo?.laptop_id,
      };
    });

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