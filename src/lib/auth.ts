
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


type RouteHandler = (
  req: NextRequest,
  props: any,
  user: AuthUser
) => Promise<NextResponse> | NextResponse;

export function withAuth(handler: RouteHandler, allowedRoles?: import("@/lib/permissions").UserRole[]) {
  return async (req: NextRequest, ctx: { params: any }) => {
    const token = req.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
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
      return NextResponse.json(
        { success: false, message: "Forbidden: akses ditolak" },
        { status: 403 }
      );
    }

    return handler(req, ctx, user);
  };
}

export function getFaceVerifiedExpiry(): Date {
  const now = new Date();
  // Waktu WIB = UTC+7
  const wibOffset = 7 * 60 * 60 * 1000;
  const nowWIB = new Date(now.getTime() + wibOffset);
  
  // Set ke 00:00:00 WIB besok
  const tomorrowWIB = new Date(nowWIB);
  tomorrowWIB.setUTCHours(0, 0, 0, 0);
  tomorrowWIB.setUTCDate(tomorrowWIB.getUTCDate() + 1);
  
  return new Date(tomorrowWIB.getTime() - wibOffset);
}


export function isManualAllowedDay(): boolean {
  const reference = new Date("2025-01-01T00:00:00+07:00").getTime();
  const now = Date.now();
  const daysSinceRef = Math.floor((now - reference) / (1000 * 60 * 60 * 24));
  return daysSinceRef % 3 === 0;
}