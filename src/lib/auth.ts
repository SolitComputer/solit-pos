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

export const SHIFT_CONFIG = {
  PAGI: {
    start:    { h: 7,  m: 30 },
    lateFrom: { h: 8,  m: 0  },   
    end:      { h: 12, m: 0  },
  },
  SORE: {
    start:    { h: 14, m: 0  },
    lateFrom: { h: 16, m: 0  },   
    end:      { h: 23, m: 0  },
  },
} as const;

export type ShiftType = keyof typeof SHIFT_CONFIG;

export function isAttendanceTimeForShift(shift: ShiftType = "PAGI"): boolean {
  const cfg = SHIFT_CONFIG[shift];
  const nowUTC = new Date();
  const nowWIB = new Date(nowUTC.getTime() + 7 * 60 * 60 * 1000);
  const total  = nowWIB.getUTCHours() * 60 + nowWIB.getUTCMinutes();
  const start  = cfg.start.h * 60 + cfg.start.m;
  const end    = cfg.end.h * 60 + cfg.end.m;
  return total >= start && total <= end;
}

export function isAttendanceTime(shift: "PAGI" | "SORE" = "PAGI"): boolean {
  const cfg    = SHIFT_CONFIG[shift];
  const nowUTC = new Date();
  const nowWIB = new Date(nowUTC.getTime() + 7 * 60 * 60 * 1000);
  const total  = nowWIB.getUTCHours() * 60 + nowWIB.getUTCMinutes();
  const start  = cfg.start.h * 60 + cfg.start.m;
  const end    = cfg.end.h   * 60 + cfg.end.m;
  return total >= start && total <= end;
}

export function calcAttendanceWeight(
  checkInISO: string,
  shift: ShiftType
): { weight: 1 | 0.5 | 0; status: "TEPAT" | "TERLAMBAT" | "DI_LUAR" } {
  const cfg = SHIFT_CONFIG[shift];
  const checkIn = new Date(checkInISO);
  const wibMs   = checkIn.getTime() + 7 * 60 * 60 * 1000;
  const wib     = new Date(wibMs);
  const total   = wib.getUTCHours() * 60 + wib.getUTCMinutes();
  const start   = cfg.start.h * 60 + cfg.start.m;
  const late    = cfg.lateFrom.h * 60 + cfg.lateFrom.m;
  const end     = cfg.end.h * 60 + cfg.end.m;

  if (total < start || total > end) return { weight: 0,   status: "DI_LUAR" };
  if (total >= late)                 return { weight: 0.5, status: "TERLAMBAT" };
  return                                    { weight: 1,   status: "TEPAT" };
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