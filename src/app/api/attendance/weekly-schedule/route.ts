import { NextResponse } from "next/server";
import { getCurrentUser, isFullAccess } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── GET — ambil jadwal mingguan (semua user atau per user_id) ──────────────
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");

    let query = supabase
      .from("user_weekly_schedules")
      .select("*")
      .order("day_of_week", { ascending: true });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[weekly-schedule GET] error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    console.error("[weekly-schedule GET] Exception:", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Unknown error" }, { status: 500 });
  }
}

// ─── PUT — upsert batch jadwal mingguan untuk 1 user ────────────────────────
// Body: { user_id: string, schedules: Array<{ day_of_week, shift, open_hour, ... }> }
// schedules bisa 0–7 item. Hari yang TIDAK ada di array akan DIHAPUS (artinya
// hari itu fallback ke ShiftConfig / Default).
export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !isFullAccess(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const body = await request.json();
    const { user_id, schedules } = body as {
      user_id: string;
      schedules: Array<{
        day_of_week: number;
        shift: "PAGI" | "SORE";
        open_hour: number;
        open_minute: number;
        late_hour: number;
        late_minute: number;
        close_hour: number;
        close_minute: number;
        checkout_hour: number;
        checkout_minute: number;
      }>;
    };

    if (!user_id) {
      return NextResponse.json({ success: false, message: "user_id wajib diisi" }, { status: 400 });
    }

    if (!Array.isArray(schedules)) {
      return NextResponse.json({ success: false, message: "schedules harus array" }, { status: 400 });
    }

    // Validasi day_of_week unik dan range 0-6
    const days = schedules.map(s => s.day_of_week);
    const uniqueDays = new Set(days);
    if (days.length !== uniqueDays.size) {
      return NextResponse.json({ success: false, message: "day_of_week tidak boleh duplikat" }, { status: 400 });
    }
    for (const d of days) {
      if (d < 0 || d > 6) {
        return NextResponse.json({ success: false, message: `day_of_week ${d} di luar range 0-6` }, { status: 400 });
      }
    }

    // 1) Hapus semua jadwal mingguan lama untuk user ini
    const { error: delError } = await supabase
      .from("user_weekly_schedules")
      .delete()
      .eq("user_id", user_id);

    if (delError) {
      console.error("[weekly-schedule PUT] delete error:", delError);
      return NextResponse.json({ success: false, message: delError.message }, { status: 500 });
    }

    // 2) Insert batch baru (kalau ada)
    if (schedules.length > 0) {
      const rows = schedules.map(s => ({
        user_id,
        day_of_week: s.day_of_week,
        shift: s.shift,
        open_hour: s.open_hour,
        open_minute: s.open_minute,
        late_hour: s.late_hour,
        late_minute: s.late_minute,
        close_hour: s.close_hour,
        close_minute: s.close_minute,
        checkout_hour: s.checkout_hour,
        checkout_minute: s.checkout_minute,
      }));

      const { error: insError } = await supabase
        .from("user_weekly_schedules")
        .insert(rows);

      if (insError) {
        console.error("[weekly-schedule PUT] insert error:", insError);
        return NextResponse.json({ success: false, message: insError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[weekly-schedule PUT] Exception:", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Unknown error" }, { status: 500 });
  }
}

// ─── DELETE — hapus semua jadwal mingguan untuk 1 user ───────────────────────
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !isFullAccess(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");

    if (!userId) {
      return NextResponse.json({ success: false, message: "user_id wajib diisi" }, { status: 400 });
    }

    const { error } = await supabase
      .from("user_weekly_schedules")
      .delete()
      .eq("user_id", userId);

    if (error) {
      console.error("[weekly-schedule DELETE] error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[weekly-schedule DELETE] Exception:", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Unknown error" }, { status: 500 });
  }
}