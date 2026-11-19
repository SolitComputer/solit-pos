// app/api/laptops/pengelola/decision/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PENGELOLA_DECISION_ROLES } from "@/lib/permissions";
import { recalcLaptopParentQty } from "@/lib/laptopStock";
import { logActivity } from "@/lib/activityLogger";

// ─── POST /api/laptops/pengelola/decision ──────────────────────────────
// Body: { unit_id, decision, spareparts?: [{sparepart_name, estimasi_harga?, pic_user_id?, catatan?}] }
// decision ∈ "PERBAIKI" | "MINUS_SIAP_JUAL" | "ASET_MATOT"
//
// Logic:
//   PERBAIKI:
//     - qc_status = 'IN_SPAREPART'
//     - status    = 'SERVICE'
//     - Insert N baris ke sparepart_queue (bisa multi sparepart per unit)
//   MINUS_SIAP_JUAL:
//     - qc_status = NULL (keluar alur QC)
//     - status    = 'MINUS_SIAP_JUAL'
//     - Modal & harga jual nanti diisi di halaman /laptops/minus-siap-jual
//   ASET_MATOT:
//     - Delete unit dari laptop_units
//     - Insert ke dead_assets
//     - recalc parent qty
async function handler(req: NextRequest, _ctx: unknown, user: AuthUser) {
  try {
    const body = await req.json();
    const { unit_id, decision, spareparts = [], keterangan } = body;

    if (!unit_id || !["PERBAIKI", "MINUS_SIAP_JUAL", "ASET_MATOT"].includes(decision)) {
      return NextResponse.json({
        success: false,
        message: "unit_id & decision (PERBAIKI/MINUS_SIAP_JUAL/ASET_MATOT) wajib diisi",
      }, { status: 400 });
    }

    // 1. Fetch unit + laptop
    const { data: unit, error: fetchErr } = await supabase
      .from("laptop_units")
      .select("*, laptop:laptops(laptop_name)")
      .eq("id", unit_id)
      .single();

    if (fetchErr || !unit) {
      return NextResponse.json({ success: false, message: "Unit tidak ditemukan" }, { status: 404 });
    }

    // Guard: hanya unit FROM_QC yang boleh diputuskan di sini
    if (unit.qc_status !== "FROM_QC") {
      return NextResponse.json({
        success: false,
        message: `Unit ini bukan dari alur QC (qc_status saat ini: ${unit.qc_status ?? "—"})`,
      }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    // ─── OPSI 1: PERBAIKI → masuk antrian sparepart ──────────────────────
    // ✅ REVISI 2026-11-19: sparepart TIDAK lagi di-input di sini.
    // Pengelola cuma klik "Bisa Diperbaiki" + konfirmasi. Unit masuk antrian
    // IN_SPAREPART, user tambah sparepart (opsional, multi-item) nanti
    // di halaman Antrian Sparepart.
    if (decision === "PERBAIKI") {
      // Update unit — masuk antrian sparepart
      const { error: updErr } = await supabase.from("laptop_units").update({
        qc_status: "IN_SPAREPART",
        status: "SERVICE",
        pengelola_decision: "PERBAIKI",
        pengelola_decided_at: nowIso,
        pengelola_decided_by: user.id,
      }).eq("id", unit_id);
      if (updErr) return NextResponse.json({ success: false, message: updErr.message }, { status: 400 });

      await recalcLaptopParentQty(supabase, unit.laptop_id);
      await supabase.from("qc_history").insert({
        unit_id, laptop_id: unit.laptop_id,
        from_qc_status: "FROM_QC", to_qc_status: "IN_SPAREPART",
        from_status: unit.status, to_status: "SERVICE",
        actor_user_id: user.id, actor_name: user.name,
        reason: "Pengelola Barang: BISA DIPERBAIKI → masuk antrian sparepart",
      });
      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "EDIT", entity: "unit", entityId: unit_id,
        entityLabel: `SN: ${unit.serial_number} — Pengelola: PERBAIKI (sparepart diisi nanti)`,
        beforeData: unit,
      });

      return NextResponse.json({
        success: true,
        decision: "PERBAIKI",
      });
    }

    // ─── OPSI 2: MINUS_SIAP_JUAL ─────────────────────────────────────────
    if (decision === "MINUS_SIAP_JUAL") {
      const { error: updErr } = await supabase.from("laptop_units").update({
        qc_status: null, // keluar alur QC
        status: "MINUS_SIAP_JUAL",
        pengelola_decision: "TIDAK_BISA",
        pengelola_decided_at: nowIso,
        pengelola_decided_by: user.id,
      }).eq("id", unit_id);
      if (updErr) return NextResponse.json({ success: false, message: updErr.message }, { status: 400 });

      await recalcLaptopParentQty(supabase, unit.laptop_id);
      await supabase.from("qc_history").insert({
        unit_id, laptop_id: unit.laptop_id,
        from_qc_status: "FROM_QC", to_qc_status: null,
        from_status: unit.status, to_status: "MINUS_SIAP_JUAL",
        actor_user_id: user.id, actor_name: user.name,
        reason: "Pengelola Barang: TIDAK BISA → MINUS SIAP JUAL",
      });
      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "EDIT", entity: "unit", entityId: unit_id,
        entityLabel: `SN: ${unit.serial_number} — Pengelola: MINUS SIAP JUAL`,
        beforeData: unit,
      });

      return NextResponse.json({ success: true, decision: "MINUS_SIAP_JUAL" });
    }

    // ─── OPSI 3: ASET_MATOT ──────────────────────────────────────────────
    if (decision === "ASET_MATOT") {
      // Insert ke dead_assets
      const { error: deadErr } = await supabase.from("dead_assets").insert({
        nama_barang: unit.laptop?.laptop_name || "Tidak diketahui",
        keterangan: (keterangan && String(keterangan).trim()) || unit.analisa || unit.repair_notes || null,
        kondisi: unit.condition_note || null,
        asal_serial_number: unit.serial_number,
        asal_laptop_name: unit.laptop?.laptop_name || null,
        created_by: user?.id || null,
        created_by_name: user?.name || null,
      });
      if (deadErr) return NextResponse.json({ success: false, message: deadErr.message }, { status: 400 });

      await supabase.from("qc_history").insert({
        unit_id, laptop_id: unit.laptop_id,
        from_qc_status: "FROM_QC", to_qc_status: null,
        from_status: unit.status, to_status: null,
        actor_user_id: user.id, actor_name: user.name,
        reason: "Pengelola Barang: TIDAK BISA → ASET MATOT (unit dihapus)",
      });

      // Delete unit
      const { error: delErr } = await supabase.from("laptop_units").delete().eq("id", unit_id);
      if (delErr) return NextResponse.json({ success: false, message: delErr.message }, { status: 400 });

      await recalcLaptopParentQty(supabase, unit.laptop_id);
      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "DELETE", entity: "unit", entityId: unit_id,
        entityLabel: `SN: ${unit.serial_number} — Pengelola: ASET MATOT`,
        beforeData: unit,
      });

      return NextResponse.json({ success: true, decision: "ASET_MATOT" });
    }

    return NextResponse.json({ success: false, message: "Unknown decision" }, { status: 400 });
  } catch (err) {
    console.error("[pengelola/decision POST]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const POST = withAuth(handler, PENGELOLA_DECISION_ROLES);