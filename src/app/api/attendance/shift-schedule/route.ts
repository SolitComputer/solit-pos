import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { getAttendanceScope } from "@/lib/attendanceScope";
import { SHIFT_DEFAULTS, type ShiftName } from "@/lib/shiftSchedule";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET ?year=2026&month=7  (atau ?from=&to=)  → semua jadwal yang overlap rentang
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("user_id");

    let from = searchParams.get("from");
    let to = searchParams.get("to");

    if (!from || !to) {
      const year = Number(searchParams.get("year") ?? new Date().getFullYear());
      const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);
      if (month < 1 || month > 12) {
        return NextResponse.json({ success: false, message: "Bulan tidak valid" }, { status: 400 });
      }
      const pad = String(month).padStart(2, "0");
      const lastDay = new Date(year, month, 0).getDate();
      from = `${year}-${pad}-01`;
      to = `${year}-${pad}-${String(lastDay).padStart(2, "0")}`;
    }

    const scope = await getAttendanceScope(supabase, user);

    let q = supabase
      .from("user_shift_schedule")
      .select("*, users!user_shift_schedule_user_id_fkey (id, name, role)")
      .lte("start_date", to)
      .gte("end_date", from)
      .order("start_date", { ascending: true });

    if (!scope.all) q = q.in("user_id", scope.visibleIds);
    if (targetUserId) {
      if (!scope.all && !scope.visibleIds.includes(targetUserId)) {
        return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
      }
      q = q.eq("user_id", targetUserId);
    }

    const { data, error } = await q;
    if (error) {
      console.error("[shift-schedule GET]", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err: any) {
    console.error("[shift-schedule GET]", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// POST — bulk: { user_ids: string[], start_date, end_date, days_of_week?, shift, ...jam?, notes? }
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const body = await request.json();
    const userIds: string[] = Array.isArray(body.user_ids)
      ? body.user_ids
      : body.user_id ? [body.user_id] : [];

    const {
      start_date, end_date, shift, notes,
      open_hour, open_minute, late_hour, late_minute, close_hour, close_minute,
      checkout_hour, checkout_minute, // ✅ NEW — jam pulang, independen dari open/late/close
    } = body;

    const daysOfWeek: number[] = Array.isArray(body.days_of_week) && body.days_of_week.length > 0
      ? body.days_of_week
      : [0, 1, 2, 3, 4, 5, 6];

    // ── Validasi input ──────────────────────────────────────────────────────
    if (userIds.length === 0) {
      return NextResponse.json({ success: false, message: "Pilih minimal 1 karyawan" }, { status: 400 });
    }
    if (!DATE_RE.test(start_date ?? "") || !DATE_RE.test(end_date ?? "")) {
      return NextResponse.json({ success: false, message: "Format tanggal harus YYYY-MM-DD" }, { status: 400 });
    }
    if (end_date < start_date) {
      return NextResponse.json({ success: false, message: "Tanggal selesai harus setelah tanggal mulai" }, { status: 400 });
    }
    if (shift !== "PAGI" && shift !== "SORE") {
      return NextResponse.json({ success: false, message: "Shift harus PAGI atau SORE" }, { status: 400 });
    }
    if (daysOfWeek.some(d => !Number.isInteger(d) || d < 0 || d > 6)) {
      return NextResponse.json({ success: false, message: "Hari tidak valid (0–6)" }, { status: 400 });
    }

    // Jam custom bersifat all-or-nothing
    const useCustom = open_hour != null || late_hour != null || close_hour != null;
    let hours: Record<string, number | null> = {
      open_hour: null, open_minute: null,
      late_hour: null, late_minute: null,
      close_hour: null, close_minute: null,
    };

    if (useCustom) {
      if (open_hour == null || late_hour == null || close_hour == null) {
        return NextResponse.json(
          { success: false, message: "Jam buka, telat, dan tutup wajib diisi semua kalau pakai jam custom" },
          { status: 400 }
        );
      }
      const o = open_hour * 60 + (open_minute ?? 0);
      const l = late_hour * 60 + (late_minute ?? 0);
      const c = close_hour * 60 + (close_minute ?? 0);
      if (o >= l) return NextResponse.json({ success: false, message: "Jam buka harus sebelum jam telat" }, { status: 400 });
      if (l >= c) return NextResponse.json({ success: false, message: "Jam telat harus sebelum jam tutup" }, { status: 400 });

      hours = {
        open_hour, open_minute: open_minute ?? 0,
        late_hour, late_minute: late_minute ?? 0,
        close_hour, close_minute: close_minute ?? 0,
      };
    }

    // ✅ NEW — jam pulang (checkout) independen dari open/late/close di atas:
    // bisa di-override sendiri tanpa harus ikut nge-custom jam masuk juga.
    // null di sini artinya "jadwal tanggal ini TIDAK meng-custom checkout" —
    // resolveScheduleOverride() lalu tetap pakai checkout dari
    // user_shift_config si karyawan, bukan ketiban default shift begitu saja.
    let checkoutFields: { checkout_hour: number | null; checkout_minute: number | null } = {
      checkout_hour: null, checkout_minute: null,
    };
    if (checkout_hour != null) {
      const shiftDefault = SHIFT_DEFAULTS[shift as ShiftName];
      const effectiveCloseTotal = useCustom
        ? close_hour * 60 + (close_minute ?? 0)
        : shiftDefault.close_hour * 60 + shiftDefault.close_minute;
      const checkoutTotal = checkout_hour * 60 + (checkout_minute ?? 0);
      if (effectiveCloseTotal >= checkoutTotal) {
        return NextResponse.json(
          { success: false, message: "Jam pulang harus setelah jam tutup absen masuk" },
          { status: 400 }
        );
      }
      checkoutFields = { checkout_hour, checkout_minute: checkout_minute ?? 0 };
    }

    // ── Otorisasi ───────────────────────────────────────────────────────────
    const scope = await getAttendanceScope(supabase, user);
    if (!scope.all) {
      const forbidden = userIds.filter(id => !scope.manageableIds.includes(id));
      if (forbidden.length > 0) {
        return NextResponse.json(
          { success: false, message: "Ada karyawan di luar divisi kamu" },
          { status: 403 }
        );
      }
    }

    const rows = userIds.map(uid => ({
      user_id: uid,
      start_date,
      end_date,
      days_of_week: daysOfWeek,
      shift: shift as ShiftName,
      ...hours,
      ...checkoutFields, // ✅ NEW
      notes: notes || null,
      created_by: user.id,
    }));

    const { data, error } = await supabase
      .from("user_shift_schedule")
      .insert(rows)
      .select("*, users!user_shift_schedule_user_id_fkey (id, name, role)");

    if (error) {
      console.error("[shift-schedule POST]", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: data ?? [],
      preview: SHIFT_DEFAULTS[shift as ShiftName],
    });
  } catch (err: any) {
    console.error("[shift-schedule POST]", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// DELETE ?id=xxx
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, message: "id wajib diisi" }, { status: 400 });

    const { data: record } = await supabase
      .from("user_shift_schedule")
      .select("id, user_id")
      .eq("id", id)
      .maybeSingle();

    if (!record) {
      return NextResponse.json({ success: false, message: "Jadwal tidak ditemukan" }, { status: 404 });
    }

    const scope = await getAttendanceScope(supabase, user);
    if (!scope.all && !scope.manageableIds.includes(record.user_id)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const { error } = await supabase.from("user_shift_schedule").delete().eq("id", id);
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[shift-schedule DELETE]", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}