import type { SupabaseClient } from "@supabase/supabase-js";

export type ShiftName = "PAGI" | "SORE";

export type ShiftWindow = {
  open_hour: number;  open_minute: number;
  late_hour: number;  late_minute: number;
  close_hour: number; close_minute: number;
};

export const SHIFT_DEFAULTS: Record<ShiftName, ShiftWindow> = {
  PAGI: { open_hour: 7,  open_minute: 30, late_hour: 8,  late_minute: 0, close_hour: 12, close_minute: 0 },
  SORE: { open_hour: 14, open_minute: 0,  late_hour: 16, late_minute: 0, close_hour: 18, close_minute: 0 },
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
  notes: string | null;
  created_at: string;
};

export type EffectiveShift = ShiftWindow & {
  shift: ShiftName;
  source: "SCHEDULE" | "CONFIG" | "DEFAULT";
  schedule_id: string | null;
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
};

export function toAuthScheduleShape(eff: EffectiveShift): ScheduleTimes {
  return {
    start:    { h: eff.open_hour,  m: eff.open_minute },
    lateFrom: { h: eff.late_hour,  m: eff.late_minute },
    end:      { h: eff.close_hour, m: eff.close_minute },
  };
}


export async function resolveScheduleOverride(
  supabase: SupabaseClient,
  userId: string,
  dateStr: string
): Promise<EffectiveShift | null> {
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
  };
}