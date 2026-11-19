// src/app/api/laptops/sparepart-queue/unit/[unitId]/finish/route.ts
//
// POST — Tandai SEMUA sparepart unit ini SELESAI + auto cek QC.
// Dipakai tombol "Selesai" & "Selesai Tanpa Sparepart" di tab Antrian Sparepart.
// Logic:
//   1. Mark semua sparepart MENUNGGU untuk unit ini jadi SELESAI (kalau ada)
//   2. Auto cek QC completeness:
//      - Lengkap → qc_status=QC_DONE + status=SIAP_JUAL
//      - Belum   → qc_status=NEEDS_QC + status=BELUM_SIAP (balik ke Team QC)

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PENGELOLA_DECISION_ROLES } from "@/lib/permissions";
import { isUnitQcComplete } from "@/lib/qcCriteria";
import { recalcLaptopParentQty } from "@/lib/laptopStock";

interface Props { params: Promise<{ unitId: string }>; }

async function postHandler(_req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { unitId } = await props.params;

    // Fetch unit + laptop parent
    const { data: unit, error: unitErr } = await supabase
      .from("laptop_units")
      .select("*, laptop:laptops(*)")
      .eq("id", unitId)
      .single();

    if (unitErr || !unit || !unit.laptop) {
      return NextResponse.json({ success: false, message: "Unit tidak ditemukan" }, { status: 404 });
    }
    if (unit.qc_status !== "IN_SPAREPART") {
      return NextResponse.json({
        success: false,
        message: `Unit tidak di antrian sparepart (qc_status: ${unit.qc_status ?? "—"})`,
      }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    // 1. Mark semua sparepart MENUNGGU untuk unit ini SELESAI
    const { count: menungguCount } = await supabase
      .from("sparepart_queue")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unitId)
      .eq("status", "MENUNGGU");

    if ((menungguCount ?? 0) > 0) {
      const { error: updErr } = await supabase.from("sparepart_queue").update({
        status: "SELESAI",
        completed_at: nowIso,
        completed_by: user.id,
      }).eq("unit_id", unitId).eq("status", "MENUNGGU");
      if (updErr) return NextResponse.json({ success: false, message: updErr.message }, { status: 400 });
    }

    // 2. Auto cek kelengkapan QC
    const isComplete = isUnitQcComplete(
      unit as unknown as import("@/lib/qcCriteria").LaptopUnitForQc,
      unit.laptop as unknown as import("@/lib/qcCriteria").LaptopForQc
    );

    if (isComplete) {
      await supabase.from("laptop_units").update({
        qc_status: "QC_DONE", status: "SIAP_JUAL",
        qc_completed_at: nowIso, qc_completed_by: user.id,
      }).eq("id", unitId);

      await supabase.from("qc_history").insert({
        unit_id: unitId, laptop_id: unit.laptop_id,
        from_qc_status: "IN_SPAREPART", to_qc_status: "QC_DONE",
        from_status: unit.status, to_status: "SIAP_JUAL",
        actor_user_id: user.id, actor_name: user.name,
        reason: `Perbaikan selesai (${menungguCount ?? 0} sparepart) + kriteria QC lengkap → auto SIAP_JUAL`,
      });
      await recalcLaptopParentQty(supabase, unit.laptop_id);

      return NextResponse.json({
        success: true,
        message: `Unit selesai diperbaiki — langsung SIAP JUAL${(menungguCount ?? 0) > 0 ? ` (${menungguCount} sparepart dicatat)` : " (tanpa sparepart)"}`,
        new_status: "SIAP_JUAL",
      });
    }

    // Kriteria QC belum lengkap → balik ke Team QC
    await supabase.from("laptop_units").update({
      qc_status: "NEEDS_QC", status: "BELUM_SIAP",
    }).eq("id", unitId);

    await supabase.from("qc_history").insert({
      unit_id: unitId, laptop_id: unit.laptop_id,
      from_qc_status: "IN_SPAREPART", to_qc_status: "NEEDS_QC",
      from_status: unit.status, to_status: "BELUM_SIAP",
      actor_user_id: user.id, actor_name: user.name,
      reason: `Perbaikan selesai (${menungguCount ?? 0} sparepart) tapi kriteria QC belum lengkap → balik ke Team QC`,
    });
    await recalcLaptopParentQty(supabase, unit.laptop_id);

    return NextResponse.json({
      success: true,
      message: `Unit selesai diperbaiki, tapi kriteria QC belum lengkap — balik ke Team QC`,
      new_status: "BELUM_SIAP",
    });
  } catch (err) {
    console.error("[sparepart-queue/unit/finish]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, PENGELOLA_DECISION_ROLES);