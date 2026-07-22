import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth, AuthUser, hasAnyRole } from "@/lib/auth";
import { PREPARATION_DELIVERY_PERSON_ROLES, NOTIFICATION_SETTINGS_ROLES } from "@/lib/permissions";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

interface Props { params: Promise<{ userId: string }>; }

const ALLOWED_SOUND_KEYS = new Set(["default", "urgent", "bell", "double_beep", "custom"]);

// GET: user ambil setting punya diri sendiri (dipakai DeliveryAlertListener & halaman Pengantaran)
async function getHandler(_req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { userId } = await props.params;
    const isSelf = user.id === userId;
    const isManager = hasAnyRole(user.roles ?? [user.role], NOTIFICATION_SETTINGS_ROLES);
    if (!isSelf && !isManager) {
      return NextResponse.json({ success: false, message: "Tidak diizinkan" }, { status: 403 });
    }
    const { data, error } = await admin
      .from("user_notification_settings")
      .select("sound_key, repeat_enabled, repeat_interval_ms, custom_sound_url")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data ?? { sound_key: "default", repeat_enabled: false, repeat_interval_ms: 4000, custom_sound_url: null },
    });
  } catch (err) {
    console.error("[GET /api/notification-settings/[userId]]", err);
    return NextResponse.json({ success: false, message: "Gagal mengambil pengaturan" }, { status: 500 });
  }
}

// PATCH: Admin ubah suara + mode berulang buat 1 akun
async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { userId } = await props.params;
    const body = await req.json();
    const { sound_key, repeat_enabled, repeat_interval_ms, custom_sound_url } = body;

    if (sound_key && !ALLOWED_SOUND_KEYS.has(sound_key)) {
      return NextResponse.json({ success: false, message: "Sound key tidak valid" }, { status: 400 });
    }
    if (sound_key === "custom" && !custom_sound_url) {
      return NextResponse.json({ success: false, message: "Pilih file suara custom dulu" }, { status: 400 });
    }

    const patch: Record<string, any> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
      ...(sound_key && { sound_key }),
      ...(typeof repeat_enabled === "boolean" && { repeat_enabled }),
      ...(repeat_interval_ms != null && { repeat_interval_ms: Math.max(2000, Number(repeat_interval_ms)) }),
      ...(custom_sound_url !== undefined && { custom_sound_url: custom_sound_url || null }),
    };

    const { data, error } = await admin
      .from("user_notification_settings")
      .upsert(patch, { onConflict: "user_id" })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[PATCH /api/notification-settings/[userId]]", err);
    return NextResponse.json({ success: false, message: "Gagal menyimpan pengaturan" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, [...PREPARATION_DELIVERY_PERSON_ROLES, ...NOTIFICATION_SETTINGS_ROLES]);
export const PATCH = withAuth(patchHandler, NOTIFICATION_SETTINGS_ROLES);