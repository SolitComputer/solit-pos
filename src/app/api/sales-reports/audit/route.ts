import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth } from "@/lib/auth";
import { hasAnyRole, SALES_REPORT_AUDIT_ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// POST /api/sales-reports/audit  { id: string }
// Menandai 1 laporan sebagai sudah diaudit. Client sudah menjalankan
// konfirmasi 2 langkah sebelum memanggil ini — endpoint ini tetap mengecek
// role di server (defense-in-depth), jadi tidak bisa dibypass dari luar.
export const POST = withAuth(async (req, _ctx, user) => {
  try {
    const userRoles: string[] = user.roles?.length > 0 ? user.roles : [user.role];
    if (!hasAnyRole(userRoles, SALES_REPORT_AUDIT_ROLES)) {
      return NextResponse.json({ success: false, message: "Tidak punya akses audit" }, { status: 403 });
    }

    const body = await req.json();
    const id = (body.id ?? "").toString();
    if (!id) {
      return NextResponse.json({ success: false, message: "id wajib diisi" }, { status: 400 });
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("sales_online_reports")
      .select("id, audited")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });
    }
    if (existing.audited) {
      return NextResponse.json({ success: false, message: "Laporan ini sudah diaudit sebelumnya" }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("sales_online_reports")
      .update({
        audited: true,
        audited_by: user.id,
        audited_by_name: user.name,
        audited_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Sales report audit error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
});