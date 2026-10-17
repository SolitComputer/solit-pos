import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyToken } from "@/lib/auth";
import { SALES_REPORT_SOFT_DELETE_ROLES, hasAnyRole } from "@/lib/permissions";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function getAuthedUser(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return null;
  const user = await verifyToken(token);
  if (!user) return null;
  const roles: string[] =
    Array.isArray((user as any).roles) && (user as any).roles.length > 0
      ? (user as any).roles
      : [(user as any).role].filter(Boolean);
  return { ...(user as any), roles };
}

// POST /api/sales-reports/restore — kembalikan laporan yang tadinya di-soft-delete.
export async function POST(request: NextRequest) {
  const user = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!hasAnyRole(user.roles, SALES_REPORT_SOFT_DELETE_ROLES)) {
    return NextResponse.json(
      { success: false, message: "Kamu tidak punya akses untuk me-restore laporan." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { id } = body;
  if (!id) {
    return NextResponse.json({ success: false, message: "ID tidak ditemukan." }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("sales_online_reports")
    .select("id, deleted_at")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ success: false, message: "Laporan tidak ditemukan." }, { status: 404 });
  }
  if (!existing.deleted_at) {
    return NextResponse.json({ success: false, message: "Laporan ini tidak sedang terhapus." }, { status: 409 });
  }

  const { error } = await supabase
    .from("sales_online_reports")
    .update({
      deleted_at: null,
      deleted_by: null,
      deleted_by_name: null,
      delete_reason: null,
    })
    .eq("id", id);

  if (error) {
    console.error("API Error (POST /api/sales-reports/restore):", error);
    return NextResponse.json({ success: false, message: "Gagal me-restore laporan." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}