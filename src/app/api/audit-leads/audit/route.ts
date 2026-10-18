import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyToken } from "@/lib/auth";
import { AUDIT_LEADS_AUDIT_ROLES, hasAnyRole } from "@/lib/permissions";

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

// POST /api/audit-leads/audit — tandai 1 leads sebagai sudah diaudit
export async function POST(request: NextRequest) {
  const user = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!hasAnyRole(user.roles, AUDIT_LEADS_AUDIT_ROLES)) {
    return NextResponse.json({ success: false, message: "Kamu tidak punya akses untuk mengaudit leads." }, { status: 403 });
  }

  const body = await request.json();
  const { id } = body;
  if (!id) {
    return NextResponse.json({ success: false, message: "ID tidak ditemukan." }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("audit_leads")
    .select("audited")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ success: false, message: "Data tidak ditemukan." }, { status: 404 });
  }
  if (existing.audited) {
    return NextResponse.json({ success: false, message: "Data ini sudah diaudit sebelumnya." }, { status: 409 });
  }

  const { data: userData } = await supabase
    .from("users")
    .select("name")
    .eq("id", user.id)
    .single();

  const { data, error } = await supabase
    .from("audit_leads")
    .update({
      audited: true,
      audited_by: user.id,
      audited_by_name: userData?.name ?? "Unknown",
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("API Error (POST /api/audit-leads/audit):", error);
    return NextResponse.json({ success: false, message: "Gagal audit data." }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}