import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { hasAnyRole, SALES_REPORT_AUDIT_ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const TABLE = "sales_online_reports";
const REASONS = ["CHAT_TIDAK_TERBALAS", "SALAH_INPUT", "DATA_TIDAK_SESUAI"];

function getRoles(user: AuthUser): string[] {
  const u = user as any;
  return Array.isArray(u?.roles) && u.roles.length > 0 ? u.roles : u?.role ? [u.role] : [];
}

// POST /api/sales-reports/reject  { id, reason }
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    if (!hasAnyRole(getRoles(user), SALES_REPORT_AUDIT_ROLES)) {
      return NextResponse.json({ success: false, message: "Role Anda tidak diizinkan menolak audit" }, { status: 403 });
    }
    const { id, reason } = await req.json().catch(() => ({}));
    if (!id) return NextResponse.json({ success: false, message: "id wajib diisi" }, { status: 400 });
    if (!REASONS.includes(reason)) {
      return NextResponse.json({ success: false, message: "Alasan tolak tidak valid" }, { status: 400 });
    }

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from(TABLE)
      .select("id, audited, rejected")
      .eq("id", id)
      .single();
    if (fetchErr || !existing) {
      return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });
    }
    if (existing.audited) {
      return NextResponse.json({ success: false, message: "Laporan yang sudah diaudit tidak bisa ditolak" }, { status: 409 });
    }
    if (existing.rejected) {
      return NextResponse.json({ success: false, message: "Laporan ini sudah ditolak" }, { status: 409 });
    }

    // Tolak = final. audited tetap false → tidak masuk Laporan Marketing & tidak dihitung Total Lead.
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update({
        rejected: true,
        reject_reason: reason,
        rejected_by: user.id,
        rejected_by_name: user.name,
        rejected_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Sales report reject error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export const POST = withAuth(postHandler);