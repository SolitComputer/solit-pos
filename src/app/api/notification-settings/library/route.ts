import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth, AuthUser } from "@/lib/auth";
import { NOTIFICATION_SETTINGS_ROLES } from "@/lib/permissions";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function getHandler(_req: NextRequest, _ctx: any, _user: AuthUser) {
  try {
    const { data, error } = await admin
      .from("notification_sound_library")
      .select("id, name, file_url, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err) {
    console.error("[GET /api/notification-settings/library]", err);
    return NextResponse.json({ success: false, message: "Gagal mengambil daftar suara" }, { status: 500 });
  }
}

async function deleteHandler(req: NextRequest, _ctx: any, _user: AuthUser) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, message: "ID wajib diisi" }, { status: 400 });
    const { error } = await admin.from("notification_sound_library").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/notification-settings/library]", err);
    return NextResponse.json({ success: false, message: "Gagal menghapus suara" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, NOTIFICATION_SETTINGS_ROLES);
export const DELETE = withAuth(deleteHandler, NOTIFICATION_SETTINGS_ROLES);