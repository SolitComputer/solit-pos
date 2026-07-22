import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_DELIVERY_PERSON_ROLES, NOTIFICATION_SETTINGS_ROLES } from "@/lib/permissions";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function getHandler(_req: NextRequest, _ctx: any, _user: AuthUser) {
  try {
    const { data: users, error: uErr } = await admin
      .from("users")
      .select("id, name, role")
      .in("role", PREPARATION_DELIVERY_PERSON_ROLES)
      .order("name", { ascending: true });
    if (uErr) throw uErr;

    const { data: settings, error: sErr } = await admin
      .from("user_notification_settings")
      .select("user_id, sound_key, repeat_enabled, repeat_interval_ms, custom_sound_url");
    if (sErr) throw sErr;

    const byUser = new Map((settings ?? []).map((s) => [s.user_id, s]));
    const merged = (users ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      sound_key: byUser.get(u.id)?.sound_key ?? "default",
      repeat_enabled: byUser.get(u.id)?.repeat_enabled ?? false,
      repeat_interval_ms: byUser.get(u.id)?.repeat_interval_ms ?? 4000,
      custom_sound_url: byUser.get(u.id)?.custom_sound_url ?? null,
    }));

    return NextResponse.json({ success: true, data: merged });
  } catch (err) {
    console.error("[GET /api/notification-settings]", err);
    return NextResponse.json({ success: false, message: "Gagal mengambil pengaturan notifikasi" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, NOTIFICATION_SETTINGS_ROLES);