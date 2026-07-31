import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { expandRolesWithParents } from "@/lib/permissions";

export type { UserRole } from "@/lib/permissions";
export {
  ROLE_DEFAULT_REDIRECT,
  ROUTE_PERMISSIONS,
  PERMISSIONS,
  hasPermission,
  isDivisionHead,
  getSubordinateRoles,
  getManageableRoles,
  canManageAttendance,
  canManageTargetRole,
  canApproveOvertime,
  DIVISION_MAP,
} from "@/lib/permissions";

// ─── AuthUser — sekarang support multi-role ───────────────────────────────────
export interface AuthUser {
  id: string;
  name: string;
  /**
   * Primary role — dipakai untuk sidebar, redirect default, dan backward compat.
   * Selalu sama dengan roles[0].
   */
  role: import("@/lib/permissions").UserRole;
  /**
   * Semua roles yang dimiliki user (NEW).
   * Minimal berisi 1 element (sama dengan role).
   * Gunakan ini untuk permission check agar union access bekerja.
   */
  roles: string[];
  shift?: "PAGI" | "SORE";
}

export const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"] as const;

export function isFullAccess(role?: string): boolean {
  return !!role && (FULL_ACCESS_ROLES as readonly string[]).includes(role);
}

/**
 * Cek full access dari array roles.
 * Return true jika SALAH SATU role adalah FULL_ACCESS.
 */
export function isFullAccessMulti(roles: string[]): boolean {
  return roles.some(r => isFullAccess(r));
}

/**
 * Ambil primary role dari array.
 * Fallback ke "CREW_SALES" jika kosong.
 */
export function getPrimaryRole(roles: string[]): import("@/lib/permissions").UserRole {
  return (roles[0] as import("@/lib/permissions").UserRole) ?? "CREW_SALES";
}

/**
 * Cek apakah salah satu dari userRoles ada di allowed list.
 * Pengganti hasPermission() untuk multi-role.
 */
export function hasAnyRole(
  userRoles: string[],
  allowed: readonly string[] | string[]
): boolean {
  return userRoles.some(r => (allowed as string[]).includes(r));
}

/**
 * Sumber tunggal JWT secret. Hard-fail kalau env tidak diset / terlalu pendek,
 * supaya tidak pernah jatuh ke konstanta publik "secret" yang bisa dipakai
 * siapa saja untuk memalsukan token admin.
 */
export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "JWT_SECRET belum diset atau terlalu pendek (min 16 karakter)."
    );
  }
  return s;
}

const getSecret = () => new TextEncoder().encode(getJwtSecret());

// ── getCurrentUser ────────────────────────────────────────────────────────────
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, getSecret());
    return normalizeAuthPayload(payload as any);
  } catch {
    return null;
  }
}

// ── verifyToken ───────────────────────────────────────────────────────────────
export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return normalizeAuthPayload(payload as any);
  } catch {
    return null;
  }
}

/**
 * Normalize JWT payload → AuthUser.
 *
 * Handles dua kondisi:
 * 1. Token LAMA  — hanya punya `role: string`  → roles = [role]
 * 2. Token BARU  — punya `roles: string[]`     → role  = roles[0]
 */
function normalizeAuthPayload(payload: Record<string, any>): AuthUser {
  // Token baru: ada field roles[]
  if (Array.isArray(payload.roles) && payload.roles.length > 0) {
    return {
      id: payload.id,
      name: payload.name,
      role: payload.roles[0] as import("@/lib/permissions").UserRole,
      roles: payload.roles as string[],
      shift: payload.shift,
    };
  }

  // Token lama: hanya ada role string
  const singleRole = (payload.role ?? "CREW_SALES") as string;
  return {
    id: payload.id,
    name: payload.name,
    role: singleRole as import("@/lib/permissions").UserRole,
    roles: [singleRole],
    shift: payload.shift,
  };
}

// ── signToken payload helper ──────────────────────────────────────────────────
/**
 * Buat JWT payload dari data user DB.
 * Dipanggil di /api/auth/login route saat issue token.
 *
 * @param user - data user dari DB (harus punya role & roles)
 */
export function buildTokenPayload(user: {
  id: string;
  name: string;
  role: string;
  roles?: string[] | null;
  shift?: string | null;
}): Record<string, any> {
  // Normalize roles array
  const rolesArray: string[] =
    Array.isArray(user.roles) && user.roles.length > 0
      ? user.roles
      : [user.role];

  return {
    id: user.id,
    name: user.name,
    role: rolesArray[0],   // primary role (backward compat untuk middleware lama)
    roles: rolesArray,     // semua roles (NEW)
    shift: user.shift ?? "PAGI",
  };
}

// ─── Shift config defaults ────────────────────────────────────────────────────
export const SHIFT_CONFIG = {
  PAGI: {
    start: { h: 7, m: 30 },
    lateFrom: { h: 8, m: 0 },
    end: { h: 12, m: 0 },
  },
  SORE: {
    start: { h: 14, m: 0 },
    lateFrom: { h: 16, m: 0 },
    end: { h: 18, m: 0 },
  },
} as const;

export interface DaySchedule {
  start: { h: number; m: number };
  lateFrom: { h: number; m: number };
  end: { h: number; m: number };
  source: "custom" | "shift" | "user_config";
}

export type ShiftType = keyof typeof SHIFT_CONFIG;

// ── resolveSchedule ───────────────────────────────────────────────────────────
export function resolveSchedule(
  shift: ShiftType,
  customSchedule?: {
    start_hour: number; start_minute: number;
    late_hour: number; late_minute: number;
    end_hour: number; end_minute: number;
  } | null
): DaySchedule {
  if (customSchedule) {
    return {
      start: { h: customSchedule.start_hour, m: customSchedule.start_minute },
      lateFrom: { h: customSchedule.late_hour, m: customSchedule.late_minute },
      end: { h: customSchedule.end_hour, m: customSchedule.end_minute },
      source: "custom",
    };
  }
  const cfg = SHIFT_CONFIG[shift];
  return {
    start: cfg.start,
    lateFrom: cfg.lateFrom,
    end: cfg.end,
    source: "shift",
  };
}

// ── resolveShiftConfigFromDB ──────────────────────────────────────────────────
export async function resolveShiftConfigFromDB(
  userId: string,
  supabaseAdmin: any
): Promise<DaySchedule> {
  const nowUTC = new Date();
  const nowWIB = new Date(nowUTC.getTime() + 7 * 60 * 60 * 1000);
  const todayDow = nowWIB.getUTCDay();
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
      start: { h: dateSchedule.start_hour, m: dateSchedule.start_minute },
      lateFrom: { h: dateSchedule.late_hour, m: dateSchedule.late_minute },
      end: { h: dateSchedule.end_hour, m: dateSchedule.end_minute },
      source: "custom",
    };
  }

  if (weeklySchedule) {
    return {
      start: { h: weeklySchedule.start_hour, m: weeklySchedule.start_minute },
      lateFrom: { h: weeklySchedule.late_hour, m: weeklySchedule.late_minute },
      end: { h: weeklySchedule.end_hour, m: weeklySchedule.end_minute },
      source: "custom",
    };
  }

  if (shiftConfig) {
    return {
      start: { h: shiftConfig.open_hour, m: shiftConfig.open_minute },
      lateFrom: { h: shiftConfig.late_hour, m: shiftConfig.late_minute },
      end: { h: shiftConfig.close_hour, m: shiftConfig.close_minute },
      source: "user_config",
    };
  }

  const cfg = SHIFT_CONFIG[shift];
  return {
    start: cfg.start,
    lateFrom: cfg.lateFrom,
    end: cfg.end,
    source: "shift",
  };
}

// ── isAttendanceTime ──────────────────────────────────────────────────────────
export function isAttendanceTime(shift: "PAGI" | "SORE" = "PAGI"): boolean {
  const cfg = SHIFT_CONFIG[shift];
  const nowUTC = new Date();
  const nowWIB = new Date(nowUTC.getTime() + 7 * 60 * 60 * 1000);
  const total = nowWIB.getUTCHours() * 60 + nowWIB.getUTCMinutes();
  const start = cfg.start.h * 60 + cfg.start.m;
  const end = cfg.end.h * 60 + cfg.end.m;
  return total >= start && total <= end;
}

// ── isAttendanceTimeForSchedule ───────────────────────────────────────────────
export function isAttendanceTimeForSchedule(schedule: DaySchedule): {
  allowed: boolean;
  reason: "TOO_EARLY" | "TOO_LATE" | "OPEN";
  openAt: string;
  closeAt: string;
} {
  const nowUTC = new Date();
  const nowWIB = new Date(nowUTC.getTime() + 7 * 60 * 60 * 1000);
  const total = nowWIB.getUTCHours() * 60 + nowWIB.getUTCMinutes();
  const start = schedule.start.h * 60 + schedule.start.m;
  const end = schedule.end.h * 60 + schedule.end.m;
  const pad = (n: number) => String(n).padStart(2, "0");
  const openAt = `${pad(schedule.start.h)}:${pad(schedule.start.m)} WIB`;
  const closeAt = `${pad(schedule.end.h)}:${pad(schedule.end.m)} WIB`;

  if (total < start) return { allowed: false, reason: "TOO_EARLY", openAt, closeAt };
  if (total > end) return { allowed: false, reason: "TOO_LATE", openAt, closeAt };
  return { allowed: true, reason: "OPEN", openAt, closeAt };
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
  const wib = new Date(checkIn.getTime() + 7 * 60 * 60 * 1000);
  const total = wib.getUTCHours() * 60 + wib.getUTCMinutes();
  const start = schedule.start.h * 60 + schedule.start.m;
  const late = schedule.lateFrom.h * 60 + schedule.lateFrom.m;
  const end = schedule.end.h * 60 + schedule.end.m;

  if (total < start || total > end) return { weight: 0, status: "DI_LUAR" };
  if (total >= late) return { weight: 0.5, status: "TERLAMBAT" };
  return { weight: 1, status: "TEPAT" };
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

// ── Attendance cookie signing (anti-forge) ─────────────────────────────────────
// Cookie absensi dulu berisi userId polos, jadi siapa pun bisa memalsukan
// `Cookie: face_attended=<id-sendiri>` untuk melewati gate absen wajah.
// Sekarang value = "<userId>.<hmac>" dengan HMAC-SHA256 memakai JWT_SECRET dan
// di-bind ke hari (WIB), sehingga tidak bisa dipalsukan atau di-replay besoknya.
// Pakai Web Crypto agar kompatibel di edge runtime (middleware).
function attendanceDayKeyWIB(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

async function attendanceHmac(userId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getJwtSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`attendance|${userId}|${attendanceDayKeyWIB()}`)
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signAttendanceCookie(userId: string): Promise<string> {
  return `${userId}.${await attendanceHmac(userId)}`;
}

export async function verifyAttendanceCookie(
  value: string | undefined | null,
  userId: string
): Promise<boolean> {
  if (!value) return false;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return false;
  if (value.slice(0, dot) !== userId) return false;
  const mac = value.slice(dot + 1);
  const expected = await attendanceHmac(userId);
  if (mac.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < mac.length; i++) {
    diff |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function hasAttendedToday(
  cookieStore: any,
  userId: string
): Promise<boolean> {
  return verifyAttendanceCookie(
    cookieStore.get("face_attended")?.value,
    userId
  );
}

// ── withAuth ──────────────────────────────────────────────────────────────────
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

    try {
      if (allowedRoles) {
        const userRoles = user.roles ?? [user.role];
        const effectiveRoles = expandRolesWithParents(userRoles);
        const hasAccess = effectiveRoles.some(r =>
          (allowedRoles as string[]).includes(r)
        );
        if (!hasAccess) {
          return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
        }
      }

      return await handler(req, ctx, user);
    } catch (err) {
      console.error("[withAuth] unhandled error:", err);
      return NextResponse.json(
        { success: false, message: "Terjadi kesalahan internal server: " + String(err) },
        { status: 500 }
      );
    }
  };
}

// ── Deprecated aliases ────────────────────────────────────────────────────────
export function getFaceVerifiedExpiry() { return getAttendanceExpiry(); }
export function isManualAllowedDay() { return false; }