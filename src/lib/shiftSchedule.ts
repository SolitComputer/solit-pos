import type { SupabaseClient } from "@supabase/supabase-js";

export type ShiftName = "PAGI" | "SORE";

export type ShiftWindow = {
  open_hour: number;  open_minute: number;
  late_hour: number;  late_minute: number;
  close_hour: number; close_minute: number;
  checkout_hour: number; checkout_minute: number; // ✅ NEW — jam pulang
};

export const SHIFT_DEFAULTS: Record<ShiftName, ShiftWindow> = {
  // ✅ NEW: checkout = jam pulang. PAGI=17:00 dikonfirmasi user; SORE=21:00
  // cuma fallback terakhir kalau gak ada override sama sekali — nilai
  // sebenarnya beda-beda per orang, diatur manual via user_shift_config
  // atau user_shift_schedule.
  PAGI: { open_hour: 7,  open_minute: 30, late_hour: 8,  late_minute: 0, close_hour: 12, close_minute: 0, checkout_hour: 17, checkout_minute: 0 },
  SORE: { open_hour: 14, open_minute: 0,  late_hour: 16, late_minute: 0, close_hour: 18, close_minute: 0, checkout_hour: 21, checkout_minute: 0 },
};

export type ShiftScheduleRow = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  days_of_week: number[] | null;
  shift: ShiftName;
  open_hour: number | null;  open_minute: number | null;
  late_hour: number | null;  late_minute: number | null;
  close_hour: number | null; close_minute: number | null;
  checkout_hour: number | null; checkout_minute: number | null; // ✅ NEW
  notes: string | null;
  created_at: string;
};

export type EffectiveShift = ShiftWindow & {
  shift: ShiftName;
  source: "SCHEDULE" | "CONFIG" | "DEFAULT";
  schedule_id: string | null;
};

/**
 * ✅ NEW — sama seperti EffectiveShift, TAPI checkout_hour/checkout_minute
 * boleh null. Dipakai KHUSUS oleh resolveScheduleOverride(): null berarti
 * "jadwal tanggal ini TIDAK meng-custom jam pulang", jadi caller harus tetap
 * pakai checkout dari baseSchedule (dari user_shift_config), BUKAN ketiban
 * default global begitu saja.
 */
export type EffectiveShiftOverride = Omit<EffectiveShift, "checkout_hour" | "checkout_minute"> & {
  checkout_hour: number | null;
  checkout_minute: number | null;
};

type ShiftWindowOverride = {
  [K in keyof ShiftWindow]?: number | null;
};

export function dowOf(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00`).getDay();
}

function spanDays(r: ShiftScheduleRow): number {
  const a = new Date(`${r.start_date}T12:00:00`).getTime();
  const b = new Date(`${r.end_date}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Rentang paling sempit menang; kalau seri → created_at terbaru. */
export function pickSchedule(rows: ShiftScheduleRow[], dateStr: string): ShiftScheduleRow | null {
  const dow = dowOf(dateStr);
  const matches = rows.filter(r =>
    r.start_date <= dateStr &&
    dateStr <= r.end_date &&
    (!r.days_of_week || r.days_of_week.length === 0 || r.days_of_week.includes(dow))
  );
  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    const sa = spanDays(a), sb = spanDays(b);
    if (sa !== sb) return sa - sb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return matches[0];
}

function windowFrom(
  shift: ShiftName,
  override?: ShiftWindowOverride | null
): ShiftWindow {
  const base = SHIFT_DEFAULTS[shift] ?? SHIFT_DEFAULTS.PAGI;

  if (
    !override ||
    override.open_hour == null ||
    override.late_hour == null ||
    override.close_hour == null
  ) {
    return { ...base };
  }

  return {
    open_hour: override.open_hour,
    open_minute: override.open_minute ?? 0,
    late_hour: override.late_hour,
    late_minute: override.late_minute ?? 0,
    close_hour: override.close_hour,
    close_minute: override.close_minute ?? 0,
    // ✅ NEW — checkout di-override SENDIRI-SENDIRI, gak ikut syarat
    // open/late/close di atas: kalau schedule/config ini gak isi checkout_hour,
    // fallback ke default shift, bukan bikin seluruh override gagal
    checkout_hour: override.checkout_hour ?? base.checkout_hour,
    checkout_minute: override.checkout_hour != null ? (override.checkout_minute ?? 0) : base.checkout_minute,
  };
}

export type ShiftContext = {
  resolve: (userId: string, dateStr: string) => EffectiveShift;
  schedulesByUser: Record<string, ShiftScheduleRow[]>;
};

/**
 * Load sekali, resolve berkali-kali (hindari N+1 query).
 * startDate/endDate = rentang tanggal yang mau dihitung (YYYY-MM-DD).
 */
export async function loadShiftContext(
  supabase: SupabaseClient,
  userIds: string[],
  startDate: string,
  endDate: string
): Promise<ShiftContext> {
  const ids = [...new Set(userIds.filter(Boolean))];

  if (ids.length === 0) {
    return {
      schedulesByUser: {},
      resolve: () => ({ shift: "PAGI", source: "DEFAULT", schedule_id: null, ...SHIFT_DEFAULTS.PAGI }),
    };
  }

  const [schedRes, cfgRes, usersRes] = await Promise.all([
    supabase
      .from("user_shift_schedule")
      .select("*")
      .in("user_id", ids)
      .lte("start_date", endDate)
      .gte("end_date", startDate),
    supabase.from("user_shift_config").select("*").in("user_id", ids),
    supabase.from("users").select("id, shift").in("id", ids),
  ]);

  const schedulesByUser: Record<string, ShiftScheduleRow[]> = {};
  (schedRes.data ?? []).forEach((r: any) => {
    (schedulesByUser[r.user_id] ??= []).push(r as ShiftScheduleRow);
  });

  const configByUser: Record<string, any> = {};
  (cfgRes.data ?? []).forEach((c: any) => { configByUser[c.user_id] = c; });

  const baseShiftByUser: Record<string, ShiftName> = {};
  (usersRes.data ?? []).forEach((u: any) => {
    baseShiftByUser[u.id] = (u.shift === "SORE" ? "SORE" : "PAGI");
  });

  const resolve = (userId: string, dateStr: string): EffectiveShift => {
    const sched = pickSchedule(schedulesByUser[userId] ?? [], dateStr);
    if (sched) {
      return {
        shift: sched.shift,
        source: "SCHEDULE",
        schedule_id: sched.id,
        ...windowFrom(sched.shift, sched),
      };
    }

    const cfg = configByUser[userId];
    if (cfg) {
      const shift: ShiftName = cfg.shift === "SORE" ? "SORE" : "PAGI";
      return { shift, source: "CONFIG", schedule_id: null, ...windowFrom(shift, cfg) };
    }

    const shift = baseShiftByUser[userId] ?? "PAGI";
    return { shift, source: "DEFAULT", schedule_id: null, ...windowFrom(shift, null) };
  };

  return { resolve, schedulesByUser };
}

export type ScheduleTimes = {
  start:    { h: number; m: number };
  lateFrom: { h: number; m: number };
  end:      { h: number; m: number };
  checkout?: { h: number; m: number }; // ✅ FIX — opsional: cuma ada kalau di-override
};

export function toAuthScheduleShape(eff: EffectiveShiftOverride): ScheduleTimes {
  const shape: ScheduleTimes = {
    start:    { h: eff.open_hour,  m: eff.open_minute },
    lateFrom: { h: eff.late_hour,  m: eff.late_minute },
    end:      { h: eff.close_hour, m: eff.close_minute },
  };
  // ✅ FIX (bug poin 1 di atas): checkout cuma disertakan kalau eff.checkout_hour
  // eksplisit ada (bukan null) — kalau jadwal tanggal ini gak nge-custom
  // checkout, biarkan caller (attendanceVerification.ts, face-status/route.ts)
  // tetap pakai checkout dari baseSchedule.
  if (eff.checkout_hour != null) {
    shape.checkout = { h: eff.checkout_hour, m: eff.checkout_minute ?? 0 };
  }
  return shape;
}

export async function resolveScheduleOverride(
  supabase: SupabaseClient,
  userId: string,
  dateStr: string
): Promise<EffectiveShiftOverride | null> {
  const { data, error } = await supabase
    .from("user_shift_schedule")
    .select("*")
    .eq("user_id", userId)
    .lte("start_date", dateStr)
    .gte("end_date", dateStr);

  if (error || !data || data.length === 0) return null;

  const picked = pickSchedule(data as ShiftScheduleRow[], dateStr);
  if (!picked) return null;

  const base = SHIFT_DEFAULTS[picked.shift] ?? SHIFT_DEFAULTS.PAGI;
  const hasCustom =
    picked.open_hour != null && picked.late_hour != null && picked.close_hour != null;

  return {
    shift: picked.shift,
    source: "SCHEDULE",
    schedule_id: picked.id,
    open_hour:  hasCustom ? picked.open_hour!  : base.open_hour,
    open_minute: hasCustom ? (picked.open_minute ?? 0) : base.open_minute,
    late_hour:  hasCustom ? picked.late_hour!  : base.late_hour,
    late_minute: hasCustom ? (picked.late_minute ?? 0) : base.late_minute,
    close_hour: hasCustom ? picked.close_hour! : base.close_hour,
    close_minute: hasCustom ? (picked.close_minute ?? 0) : base.close_minute,
    // ✅ FIX: null kalau TIDAK di-custom (jangan fallback ke default global) —
    // lihat penjelasan bug di toAuthScheduleShape.
    checkout_hour: picked.checkout_hour ?? null,
    checkout_minute: picked.checkout_hour != null ? (picked.checkout_minute ?? 0) : null,
  };
}