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

// GET /api/sales-reports/deleted — daftar laporan yang di-soft-delete (Riwayat Hapus).
export async function GET(request: NextRequest) {
  const user = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!hasAnyRole(user.roles, SALES_REPORT_SOFT_DELETE_ROLES)) {
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("sales_online_reports")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    console.error("API Error (GET /api/sales-reports/deleted):", error);
    return NextResponse.json({ success: false, message: "Gagal mengambil data." }, { status: 500 });
  }

  const rows = (data ?? []).map((r) => ({
    id: r.id,
    channel: r.channel,
    nama: r.phone_number || r.partner_name || "-",
    minat: r.interest,
    keterangan: r.keterangan,
    sumber: r.sumber ?? null,
    purchased: r.purchased,
    filled_by_name: r.filled_by_name,
    deleted_at: r.deleted_at,
    deleted_by_name: r.deleted_by_name,
    delete_reason: r.delete_reason,
    created_at: r.created_at,
  }));

  return NextResponse.json({ success: true, data: rows });
}