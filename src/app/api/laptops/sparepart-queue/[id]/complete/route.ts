// src/app/api/laptops/sparepart-queue/[id]/complete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PENGELOLA_DECISION_ROLES } from "@/lib/permissions";
import { isUnitQcComplete } from "@/lib/qcCriteria";
import { recalcLaptopParentQty } from "@/lib/laptopStock";

interface Props { params: Promise<{ id: string }>; }

// POST /api/laptops/sparepart-queue/[id]/complete
// Tombol "Selesai" di tab Antrian Sparepart. Logic:
//   1. Set sparepart_queue.status = 'SELESAI'
//   2. Cek apakah masih ada sparepart MENUNGGU untuk unit yang sama
//   3. Kalau masih ada → biarkan unit tetap di IN_SPAREPART
//   4. Kalau sudah selesai semua → cek kelengkapan QC:
//      - Lengkap → qc_status = QC_DONE, status = SIAP_JUAL
//      - Belum   → qc_status = NEEDS_QC, status = BELUM_SIAP (balik ke Team QC)
async function handler(_req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id: spId } = await props.params;

    const { data: sp, error: fetchErr } = await supabase
      .from("sparepart_queue").select("*").eq("id", spId).single();

    if (fetchErr || !sp) {
      return NextResponse.json({ success: false, message: "Sparepart tidak ditemukan" }, { status: 404 });
    }
    if (sp.status === "SELESAI") {
      return NextResponse.json({ success: false, message: "Sparepart sudah selesai sebelumnya" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    // 1. Mark sparepart SELESAI
    const { error: spUpdErr } = await supabase.from("sparepart_queue").update({
      status: "SELESAI", completed_at: nowIso, completed_by: user.id,
    }).eq("id", spId);
    if (spUpdErr) return NextResponse.json({ success: false, message: spUpdErr.message }, { status: 400 });

    // 2. Cek masih ada sparepart MENUNGGU utk unit yg sama?
    const { count: remaining } = await supabase
      .from("sparepart_queue")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", sp.unit_id)
      .eq("status", "MENUNGGU");

    if ((remaining ?? 0) > 0) {
      return NextResponse.json({
        success: true,
        message: `Sparepart ditandai selesai. Masih ada ${remaining} sparepart lain yang menunggu.`,
        unit_updated: false,
      });
    }

    // 3. Semua selesai → cek kelengkapan QC
    const { data: fresh } = await supabase
      .from("laptop_units").select("*, laptop:laptops(*)").eq("id", sp.unit_id).single();

    if (!fresh || !fresh.laptop) {
      return NextResponse.json({ success: false, message: "Unit tidak ditemukan" }, { status: 404 });
    }

    const isComplete = isUnitQcComplete(
      fresh as unknown as import("@/lib/qcCriteria").LaptopUnitForQc,
      fresh.laptop as unknown as import("@/lib/qcCriteria").LaptopForQc
    );

    if (isComplete) {
      await supabase.from("laptop_units").update({
        qc_status: "QC_DONE", status: "SIAP_JUAL",
        qc_completed_at: nowIso, qc_completed_by: user.id,
      }).eq("id", sp.unit_id);

      await supabase.from("qc_history").insert({
        unit_id: sp.unit_id, laptop_id: sp.laptop_id,
        from_qc_status: "IN_SPAREPART", to_qc_status: "QC_DONE",
        from_status: fresh.status, to_status: "SIAP_JUAL",
        actor_user_id: user.id, actor_name: user.name,
        reason: "Semua sparepart selesai + kriteria QC lengkap → auto SIAP_JUAL",
      });
      await recalcLaptopParentQty(supabase, sp.laptop_id);

      return NextResponse.json({
        success: true,
        message: "Semua sparepart selesai & kriteria lengkap — unit otomatis SIAP JUAL",
        unit_updated: true, new_status: "SIAP_JUAL",
      });
    }

    // Belum lengkap → balik ke Team QC
    await supabase.from("laptop_units").update({
      qc_status: "NEEDS_QC", status: "BELUM_SIAP",
    }).eq("id", sp.unit_id);

    await supabase.from("qc_history").insert({
      unit_id: sp.unit_id, laptop_id: sp.laptop_id,
      from_qc_status: "IN_SPAREPART", to_qc_status: "NEEDS_QC",
      from_status: fresh.status, to_status: "BELUM_SIAP",
      actor_user_id: user.id, actor_name: user.name,
      reason: "Sparepart selesai tapi kriteria belum lengkap → balik ke Team QC",
    });
    await recalcLaptopParentQty(supabase, sp.laptop_id);

    return NextResponse.json({
      success: true,
      message: "Sparepart selesai, tapi kriteria belum lengkap — unit balik ke Team QC",
      unit_updated: true, new_status: "BELUM_SIAP",
    });
  } catch (err) {
    console.error("[sparepart-queue/complete]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const POST = withAuth(handler, PENGELOLA_DECISION_ROLES);