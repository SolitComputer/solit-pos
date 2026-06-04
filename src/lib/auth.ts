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
}

const getSecret = () =>
  new TextEncoder().encode(process.env.JWT_SECRET || "secret");

// ─────────────────────────────────────────────────────────────
// SERVER ONLY FUNCTIONS
// ─────────────────────────────────────────────────────────────

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

export const ATTENDANCE_START_HOUR = 7;
export const ATTENDANCE_END_HOUR = 23;

export function isAttendanceTime(): boolean {
  const nowUTC = new Date();
  const wibMs = nowUTC.getTime() + 7 * 60 * 60 * 1000;
  const nowWIB = new Date(wibMs);
  const total = nowWIB.getUTCHours() * 60 + nowWIB.getUTCMinutes();
  const start = 7 * 60 + 30;  
  const end = 12 * 60 + 0;    
  return total >= start && total <= end;
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

export function withAuth(handler: RouteHandler, allowedRoles?: import("@/lib/permissions").UserRole[]) {
  return async (req: NextRequest, ctx: { params: any }) => {
    const token = req.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const user = await verifyToken(token);
    if (!user) {
      const res = NextResponse.json({ success: false, message: "Token tidak valid" }, { status: 401 });
      res.cookies.delete("token");
      return res;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    return handler(req, ctx, user);
  };
}

// Deprecated
export function getFaceVerifiedExpiry() { return getAttendanceExpiry(); }
export function isManualAllowedDay() { return false; }