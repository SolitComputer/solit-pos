import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export type { UserRole } from "@/lib/permissions";
export {
  ROLE_DEFAULT_REDIRECT,
  ROUTE_PERMISSIONS,
  PERMISSIONS,
  hasPermission,
} from "@/lib/permissions";

export interface AuthUser {
  id: string;
  name: string;
  role: import("@/lib/permissions").UserRole;
  shift?: "PAGI" | "SORE";
}

export const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"] as const;

export function isFullAccess(role?: string): boolean {
  return !!role && (FULL_ACCESS_ROLES as readonly string[]).includes(role);
}

const getSecret = () =>
  new TextEncoder().encode(process.env.JWT_SECRET || "secret");

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as AuthUser;
  } catch {
    return null;
  }
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as AuthUser;
  } catch {
    return null;
  }
}

// ── Shift config defaults ─────────────────────────────────────────────────────
export const SHIFT_CONFIG = {
  PAGI: {
    start:    { h: 7,  m: 30 },
    lateFrom: { h: 8,  m: 0  },
    end:      { h: 12, m: 0  },
  },
  SORE: {
    start:    { h: 14, m: 0  },
    lateFrom: { h: 16, m: 0  },
    end:      { h: 18, m: 0  },
  },
} as const;

export interface DaySchedule {
  start:    { h: number; m: number };
  lateFrom: { h: number; m: number };
  end:      { h: number; m: number };
  source: "custom" | "shift" | "user_config";
}

export type ShiftType = keyof typeof SHIFT_CONFIG;

// ── resolveSchedule: dari user_schedule / user_date_schedule ──────────────────
export function resolveSchedule(
  shift: ShiftType,
  customSchedule?: {
    start_hour: number; start_minute: number;
    late_hour:  number; late_minute:  number;
    end_hour:   number; end_minute:   number;
  } | null
): DaySchedule {
  if (customSchedule) {
    return {
      start:    { h: customSchedule.start_hour, m: customSchedule.start_minute },
      lateFrom: { h: customSchedule.late_hour,  m: customSchedule.late_minute  },
      end:      { h: customSchedule.end_hour,   m: customSchedule.end_minute   },
      source: "custom",
    };
  }
  const cfg = SHIFT_CONFIG[shift];
  return {
    start:    cfg.start,
    lateFrom: cfg.lateFrom,
    end:      cfg.end,
    source: "shift",
  };
}

// ── resolveShiftConfigFromDB ──────────────────────────────────────────────────
// Prioritas: user_date_schedule > user_schedule > user_shift_config > SHIFT_CONFIG default
// Digunakan oleh face-status dan face-verify
export async function resolveShiftConfigFromDB(
  userId: string,
  supabaseAdmin: any
): Promise<DaySchedule> {
  const nowUTC    = new Date();
  const nowWIB    = new Date(nowUTC.getTime() + 7 * 60 * 60 * 1000);
  const todayDow  = nowWIB.getUTCDay();
  const todayDate = nowWIB.toISOString().slice(0, 10);

  const [
    { data: userData },
    { data: dateSchedule },
    { data: weeklySchedule },
    { data: shiftConfig },
  ] = await Promise.all([
    supabaseAdmin.from("users").select("shift").eq("id", userId).single(),
    supabaseAdmin.from("user_date_schedule")
      .select("start_hour,start_minute,late_hour,late_minute,end_hour,end_minute")
      .eq("user_id", userId).eq("schedule_date", todayDate).maybeSingle(),
    supabaseAdmin.from("user_schedule")
      .select("start_hour,start_minute,late_hour,late_minute,end_hour,end_minute")
      .eq("user_id", userId).eq("day_of_week", todayDow).maybeSingle(),
    supabaseAdmin.from("user_shift_config")
      .select("open_hour,open_minute,late_hour,late_minute,close_hour,close_minute,shift")
      .eq("user_id", userId).maybeSingle(),
  ]);

  const shift: ShiftType = (userData?.shift as ShiftType) ?? "PAGI";

  if (dateSchedule) {
    return {
      start:    { h: dateSchedule.start_hour,  m: dateSchedule.start_minute  },
      lateFrom: { h: dateSchedule.late_hour,   m: dateSchedule.late_minute   },
      end:      { h: dateSchedule.end_hour,    m: dateSchedule.end_minute    },
      source: "custom",
    };
  }

  if (weeklySchedule) {
    return {
      start:    { h: weeklySchedule.start_hour,  m: weeklySchedule.start_minute  },
      lateFrom: { h: weeklySchedule.late_hour,   m: weeklySchedule.late_minute   },
      end:      { h: weeklySchedule.end_hour,    m: weeklySchedule.end_minute    },
      source: "custom",
    };
  }

  // Prioritas 3: user_shift_config (global override per user)
  if (shiftConfig) {
    return {
      start:    { h: shiftConfig.open_hour,  m: shiftConfig.open_minute  },
      lateFrom: { h: shiftConfig.late_hour,  m: shiftConfig.late_minute  },
      end:      { h: shiftConfig.close_hour, m: shiftConfig.close_minute },
      source: "user_config",
    };
  }

  // Prioritas 4: default dari SHIFT_CONFIG
  const cfg = SHIFT_CONFIG[shift];
  return {
    start:    cfg.start,
    lateFrom: cfg.lateFrom,
    end:      cfg.end,
    source: "shift",
  };
}

// ── isAttendanceTime ──────────────────────────────────────────────────────────
// Digunakan di middleware (tidak bisa async query DB, pakai shift dari JWT)
export function isAttendanceTime(shift: "PAGI" | "SORE" = "PAGI"): boolean {
  const cfg    = SHIFT_CONFIG[shift];
  const nowUTC = new Date();
  const nowWIB = new Date(nowUTC.getTime() + 7 * 60 * 60 * 1000);
  const total  = nowWIB.getUTCHours() * 60 + nowWIB.getUTCMinutes();
  const start  = cfg.start.h * 60 + cfg.start.m;
  const end    = cfg.end.h   * 60 + cfg.end.m;
  return total >= start && total <= end;
}

// ── isAttendanceTimeForSchedule ───────────────────────────────────────────────
// Digunakan setelah dapat schedule dari DB (lebih akurat)
export function isAttendanceTimeForSchedule(schedule: DaySchedule): {
  allowed: boolean;
  reason: "TOO_EARLY" | "TOO_LATE" | "OPEN";
  openAt:  string;
  closeAt: string;
} {
  const nowUTC = new Date();
  const nowWIB = new Date(nowUTC.getTime() + 7 * 60 * 60 * 1000);
  const total  = nowWIB.getUTCHours() * 60 + nowWIB.getUTCMinutes();
  const start  = schedule.start.h * 60 + schedule.start.m;
  const end    = schedule.end.h   * 60 + schedule.end.m;
  const pad    = (n: number) => String(n).padStart(2, "0");
  const openAt  = `${pad(schedule.start.h)}:${pad(schedule.start.m)} WIB`;
  const closeAt = `${pad(schedule.end.h)}:${pad(schedule.end.m)} WIB`;

  if (total < start) return { allowed: false, reason: "TOO_EARLY", openAt, closeAt };
  if (total > end)   return { allowed: false, reason: "TOO_LATE",  openAt, closeAt };
  return               { allowed: true,  reason: "OPEN",      openAt, closeAt };
}

export function isAttendanceTimeForShift(shift: ShiftType = "PAGI"): boolean {
  return isAttendanceTime(shift);
}

// ── calcAttendanceWeightFromSchedule ─────────────────────────────────────────
export function calcAttendanceWeightFromSchedule(
  checkInISO: string,
  schedule: DaySchedule
): { weight: 1 | 0.5 | 0; status: "TEPAT" | "TERLAMBAT" | "DI_LUAR" } {
  const checkIn = new Date(checkInISO);
  const wib     = new Date(checkIn.getTime() + 7 * 60 * 60 * 1000);
  const total   = wib.getUTCHours() * 60 + wib.getUTCMinutes();
  const start   = schedule.start.h    * 60 + schedule.start.m;
  const late    = schedule.lateFrom.h * 60 + schedule.lateFrom.m;
  const end     = schedule.end.h      * 60 + schedule.end.m;

  if (total < start || total > end) return { weight: 0, status: "DI_LUAR"    };
  if (total >= late)                return { weight: 0.5, status: "TERLAMBAT" };
  return                                   { weight: 1, status: "TEPAT"      };
}

export function calcAttendanceWeight(
  checkInISO: string,
  shift: ShiftType
): { weight: 1 | 0.5 | 0; status: "TEPAT" | "TERLAMBAT" | "DI_LUAR" } {
  const cfg = SHIFT_CONFIG[shift];
  return calcAttendanceWeightFromSchedule(checkInISO, {
    start: cfg.start, lateFrom: cfg.lateFrom, end: cfg.end, source: "shift",
  });
}

export function getAttendanceExpiry(): Date {
  const expiry = new Date();
  expiry.setHours(23, 59, 59, 999);
  return expiry;
}

export function hasAttendedToday(cookieStore: any, userId: string): boolean {
  const attendedCookie = cookieStore.get("face_attended")?.value;
  return attendedCookie === userId;
}

type RouteHandler = (
  req: NextRequest,
  props: any,
  user: AuthUser
) => Promise<NextResponse> | NextResponse;

export function withAuth(
  handler: RouteHandler,
  allowedRoles?: import("@/lib/permissions").UserRole[]
) {
  return async (req: NextRequest, ctx: { params: any }) => {
    const token = req.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    const user = await verifyToken(token);
    if (!user) {
      const res = NextResponse.json(
        { success: false, message: "Token tidak valid" },
        { status: 401 }
      );
      res.cookies.delete("token");
      return res;
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }
    return handler(req, ctx, user);
  };
}

// Deprecated aliases
export function getFaceVerifiedExpiry() { return getAttendanceExpiry(); }
export function isManualAllowedDay()    { return false; }