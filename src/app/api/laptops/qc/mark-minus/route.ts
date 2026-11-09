// app/api/laptops/qc/mark-minus/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { UserRole } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

const TEAM_QC_ROLES: UserRole[] = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "KEPALA_ADMIN_BARANG", "ADMIN_BARANG",
] as UserRole[];

// POST /api/laptops/qc/mark-minus
// Body: { unit_id, reason? }
// Logic:
//   1. Set qc_status = 'FROM_QC' → muncul di tab "Dari QC" (Pengelola Barang)
//   2. Set status = 'BELUM_SIAP' → konsisten dgn tampilan di halaman minus existing
//   3. Isi minus_status = 'BELUM_DIATASI' (kompat dengan halaman minus existing)
//   4. Log ke qc_history + activity_logs
async function handler(req: NextRequest, _ctx: unknown, user: AuthUser) {
  try {
    const { unit_id, reason } = await req.json();

    if (!unit_id) {
      return NextResponse.json({ success: false, message: "unit_id wajib diisi" }, { status: 400 });
    }

    const { data: unit, error: fetchErr } = await supabase
      .from("laptop_units").select("*").eq("id", unit_id).single();

    if (fetchErr || !unit) {
      return NextResponse.json({ success: false, message: "Unit tidak ditemukan" }, { status: 404 });
    }

    // Guard: cuma unit NEEDS_QC yang boleh ditandai minus dari Team QC
    if (unit.qc_status !== "NEEDS_QC") {
      return NextResponse.json({
        success: false,
        message: `Unit ini tidak dalam status Perlu QC (sekarang: ${unit.qc_status ?? "—"})`,
      }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    const { data: updated, error: updErr } = await supabase
      .from("laptop_units").update({
        qc_status: "FROM_QC",
        status: "BELUM_SIAP",
        minus_status: "BELUM_DIATASI",
        qc_marked_minus_at: nowIso,
        qc_marked_minus_by: user.id,
      }).eq("id", unit_id).select().single();

    if (updErr) {
      return NextResponse.json({ success: false, message: updErr.message }, { status: 400 });
    }

    // Log ke qc_history
    await supabase.from("qc_history").insert({
      unit_id,
      laptop_id: unit.laptop_id,
      from_qc_status: "NEEDS_QC",
      to_qc_status: "FROM_QC",
      from_status: unit.status,
      to_status: "BELUM_SIAP",
      actor_user_id: user.id,
      actor_name: user.name,
      reason: reason || "Team QC tandai MINUS → lempar ke Pengelola Barang",
    });

    // Log aktivitas — pakai action "EDIT" (yg sudah ada di LogAction type)
    // + entityLabel spesifik "— QC tandai minus" sebagai penanda transisi.
    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: "EDIT", entity: "unit", entityId: unit_id,
      entityLabel: `SN: ${unit.serial_number} — QC tandai minus`,
      beforeData: unit, afterData: updated,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error("[qc/mark-minus]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const POST = withAuth(handler, TEAM_QC_ROLES);