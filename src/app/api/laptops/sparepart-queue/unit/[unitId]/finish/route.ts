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

    // Fetch unit + laptop parent (optional — SN Lepas laptop_id=NULL)
    const { data: unit, error: unitErr } = await supabase
      .from("laptop_units")
      .select("*, laptop:laptops(*)")
      .eq("id", unitId)
      .single();

    // ✅ SN Lepas support: unit.laptop boleh NULL (unit lepas folder).
    // Guard asli `!unit.laptop` bikin SN Lepas 404 padahal unit valid.
    if (unitErr || !unit) {
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

    // 2. Auto cek kelengkapan QC — qcCriteria.ts sudah hybrid read
    //    (Step 4 Patch 4.2): prefer unit field, fallback laptop. Cast via
    //    `as unknown as LaptopForQc` supaya nullable laptop lolos signature
    //    yang non-optional (internally sudah null-safe di qcCriteria).
    const isComplete = isUnitQcComplete(
      unit as unknown as import("@/lib/qcCriteria").LaptopUnitForQc,
      unit.laptop as unknown as import("@/lib/qcCriteria").LaptopForQc
    );

    // ─── BRANCH A: isComplete=true → auto SIAP_JUAL + suggest folder (SN Lepas) ───
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

      // ✅ SN Lepas guard: laptop_id bisa NULL (unit lepas folder)
      if (unit.laptop_id) {
        await recalcLaptopParentQty(supabase, unit.laptop_id);
      }

      // ✅ Auto-suggest folder untuk SN Lepas (pola Step 4 Patch 4.1 + Step 5 Patch 5.3).
      // Cari folder match berdasarkan 5 pengunci: laptop_name, cpu, ram, storage, grade.
      // Return type match SuggestFolder interface di SuggestFolderModal.tsx.
      let suggestFolders: Array<{
        id: string;
        laptop_name: string | null;
        brand: string | null;
        cpu: string | null;
        ram: string | null;
        storage: string | null;
        selling_price: number | null;
        grade: string | null;
        category: string | null;
      }> = [];
      if (!unit.laptop_id && unit.laptop_name) {
        const { data: matches } = await supabase
          .from("laptops")
          .select("id, laptop_name, brand, cpu, ram, storage, grade, selling_price, category")
          .eq("laptop_name", unit.laptop_name)
          .eq("cpu", unit.cpu ?? "")
          .eq("ram", unit.ram ?? "")
          .eq("storage", unit.storage ?? "")
          .eq("grade", unit.grade ?? "")
          .limit(5);
        suggestFolders = (matches ?? []).map(m => ({
          id: m.id,
          laptop_name: m.laptop_name ?? null,
          brand: m.brand ?? null,
          cpu: m.cpu ?? null,
          ram: m.ram ?? null,
          storage: m.storage ?? null,
          grade: m.grade ?? null,
          selling_price: m.selling_price ?? null,
          category: m.category ?? null,
        }));
      }

      return NextResponse.json({
        success: true,
        message: `Unit selesai diperbaiki — langsung SIAP JUAL${(menungguCount ?? 0) > 0 ? ` (${menungguCount} sparepart dicatat)` : " (tanpa sparepart)"}`,
        new_status: "SIAP_JUAL",
        is_sn_lepas: !unit.laptop_id,
        suggest_folders: suggestFolders,
      });
    }

    // ─── BRANCH B: isComplete=false → balik ke Team QC ───
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

    // ✅ SN Lepas guard
    if (unit.laptop_id) {
      await recalcLaptopParentQty(supabase, unit.laptop_id);
    }

    return NextResponse.json({
      success: true,
      message: `Unit selesai diperbaiki, tapi kriteria QC belum lengkap — balik ke Team QC`,
      new_status: "BELUM_SIAP",
      is_sn_lepas: !unit.laptop_id,
    });
  } catch (err) {
    console.error("[sparepart-queue/unit/finish]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, PENGELOLA_DECISION_ROLES);