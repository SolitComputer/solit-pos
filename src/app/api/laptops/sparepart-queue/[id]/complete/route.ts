// app/api/laptops/sparepart-queue/[id]/complete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PENGELOLA_DECISION_ROLES } from "@/lib/permissions";
import { isUnitQcComplete } from "@/lib/qcCriteria";
import { recalcLaptopParentQty } from "@/lib/laptopStock";
import { logActivity } from "@/lib/activityLogger";

interface Props { params: Promise<{ id: string }>; }

// ─── POST /api/laptops/sparepart-queue/[id]/complete ───────────────────
// Tombol "Selesai" di tab Antrian Sparepart. Logic:
//   1. Set sparepart_queue.status = 'SELESAI'
//   2. Cek apakah masih ada sparepart MENUNGGU untuk unit yang sama
//   3. Kalau masih ada → biarkan unit tetap di IN_SPAREPART
//   4. Kalau sudah semua selesai → cek kelengkapan QC via isUnitQcComplete():
//      - Lengkap → qc_status = QC_DONE, status = SIAP_JUAL
//      - Belum lengkap → qc_status = NEEDS_QC, status = BELUM_SIAP (balik ke Team QC)
async function handler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id: spId } = await props.params;

    // 1. Fetch sparepart + unit
    const { data: sp, error: fetchErr } = await supabase
      .from("sparepart_queue").select("*").eq("id", spId).single();

    if (fetchErr || !sp) {
      return NextResponse.json({ success: false, message: "Sparepart tidak ditemukan" }, { status: 404 });
    }
    if (sp.status === "SELESAI") {
      return NextResponse.json({ success: false, message: "Sparepart sudah ditandai SELESAI sebelumnya" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    // 2. Set SELESAI
    const { error: spUpdErr } = await supabase.from("sparepart_queue").update({
      status: "SELESAI", completed_at: nowIso, completed_by: user.id,
    }).eq("id", spId);
    if (spUpdErr) return NextResponse.json({ success: false, message: spUpdErr.message }, { status: 400 });

    // 3. Cek apakah masih ada sparepart MENUNGGU untuk unit yang sama
    const { count: remaining } = await supabase
      .from("sparepart_queue")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", sp.unit_id)
      .eq("status", "MENUNGGU");

    if ((remaining ?? 0) > 0) {
      // Masih ada sparepart menunggu → unit tetap di IN_SPAREPART
      return NextResponse.json({
        success: true,
        message: `Sparepart ditandai selesai. Masih ada ${remaining} sparepart lain yang menunggu.`,
        unit_updated: false,
      });
    }

    // 4. Semua sparepart selesai → cek kelengkapan kriteria QC
    const { data: fresh, error: freshErr } = await supabase
      .from("laptop_units").select("*, laptop:laptops(*)").eq("id", sp.unit_id).single();

    if (freshErr || !fresh || !fresh.laptop) {
      return NextResponse.json({ success: false, message: "Unit tidak ditemukan" }, { status: 404 });
    }

    const isComplete = isUnitQcComplete(
      fresh as unknown as import("@/lib/qcCriteria").LaptopUnitForQc,
      fresh.laptop as unknown as import("@/lib/qcCriteria").LaptopForQc
    );

    if (isComplete) {
      // Lengkap → auto SIAP_JUAL
      await supabase.from("laptop_units").update({
        qc_status: "QC_DONE", status: "SIAP_JUAL",
        qc_completed_at: nowIso, qc_completed_by: user.id,
      }).eq("id", sp.unit_id);

      await supabase.from("qc_history").insert({
        unit_id: sp.unit_id, laptop_id: sp.laptop_id,
        from_qc_status: "IN_SPAREPART", to_qc_status: "QC_DONE",
        from_status: fresh.status, to_status: "SIAP_JUAL",
        actor_user_id: user.id, actor_name: user.name,
        reason: "Sparepart selesai + kriteria lengkap → otomatis SIAP_JUAL",
      });

      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "EDIT", entity: "unit", entityId: sp.unit_id,
        entityLabel: `SN: ${fresh.serial_number} — sparepart selesai & lengkap → SIAP_JUAL`,
        afterData: { qc_status: "QC_DONE", status: "SIAP_JUAL" },
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
      unit_updated: true, new_status: "BELUM_SIAP", qc_status: "NEEDS_QC",
    });
  } catch (err) {
    console.error("[sparepart-queue/complete POST]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const POST = withAuth(handler, PENGELOLA_DECISION_ROLES);