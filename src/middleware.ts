import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  verifyToken,
  ROUTE_PERMISSIONS,
  ROLE_DEFAULT_REDIRECT,
  UserRole,
} from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const PUBLIC_ROUTES = ["/login", "/api/auth/login", "/api/auth/logout"];
const PUBLIC_PREFIXES = ["/receipt/", "/scan/"];
const PUBLIC_API_ROUTES = ["/api/warranty/check", "/api/auth/set-password"];

const FACE_API_WHITELIST = [
  "/api/auth/face-verify",
  "/api/auth/face-enroll",
  "/api/auth/face-status",
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/login",
  "/api/presence",
  "/api/group-chat",
  "/api/push/subscribe",];

const PROTECTED_PREFIXES = ["/dashboard", "/payment"];
const ATTENDANCE_EXEMPT_ROLES = ["PROGRAMMER"];

function isAttendanceExempt(role?: string): boolean {
  return !!role && ATTENDANCE_EXEMPT_ROLES.includes(role);
}

const SYSTEM_OPEN_HOUR = 6;
const SYSTEM_CLOSE_HOUR = 22;

function isWithinSystemHours(): boolean {
  const nowUTC = new Date();
  const nowWIB = new Date(nowUTC.getTime() + 7 * 60 * 60 * 1000);
  const hour = nowWIB.getUTCHours();
  return hour >= SYSTEM_OPEN_HOUR && hour < SYSTEM_CLOSE_HOUR;
}

function hasAttendanceBypass(request: NextRequest, userId: string): boolean {
  const faceAttended = request.cookies.get("face_attended")?.value;
  const faceVerified = request.cookies.get("face_verified")?.value;
  const attendanceSkipped = request.cookies.get("attendance_skipped")?.value;
  const dayOffToday = request.cookies.get("day_off_today")?.value;
  return (
    faceAttended === userId ||
    faceVerified === userId ||
    attendanceSkipped === userId ||
    dayOffToday === userId
  );
}

// ─── Cookie helper ─────────────────────────────────────────────────────────────
const SESSION_COOKIES = [
  "token",
  "face_attended",
  "face_verified",
  "attendance_skipped",
  "day_off_today",
];

function clearSessionAndRedirect(url: URL): NextResponse {
  const response = NextResponse.redirect(url);
  for (const name of SESSION_COOKIES) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}

// ─── Auto-logout 03:00 WIB threshold ──────────────────────────────────────────
function getAutoLogoutThreshold(): number {
  const nowUTC = Date.now();
  const nowWIB = new Date(nowUTC + 7 * 3600_000);
  const wibHour = nowWIB.getUTCHours();
  const y = nowWIB.getUTCFullYear();
  const mo = nowWIB.getUTCMonth();
  const d = nowWIB.getUTCDate();
  // 03:00 WIB = 20:00 UTC hari sebelumnya = Date.UTC(y,mo,d,-4,0,0)
  const thresholdUTC = wibHour >= 3
    ? Date.UTC(y, mo, d, -4, 0, 0)
    : Date.UTC(y, mo, d - 1, -4, 0, 0);
  return Math.floor(thresholdUTC / 1000);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("token")?.value;

  // ── Public routes ────────────────────────────────────────────────────────────
  if (PUBLIC_ROUTES.includes(pathname)) {
    if (token && pathname === "/login") {
      const user = await verifyToken(token);
      if (user) {
        const exempt = isAttendanceExempt(user.role as string);
        const hasAttended = hasAttendanceBypass(request, user.id);
        if (!exempt && isWithinSystemHours() && !hasAttended) {
          return NextResponse.redirect(new URL("/face-verify", request.url));
        }
        return NextResponse.redirect(
          new URL(ROLE_DEFAULT_REDIRECT[user.role as UserRole], request.url)
        );
      }
    }
    return NextResponse.next();
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/face-verify")) {
    if (!token) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next();
  }

  if (PUBLIC_API_ROUTES.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (FACE_API_WHITELIST.some(p => pathname.startsWith(p))) {
    if (!token) return NextResponse.json({ success: false }, { status: 401 });
    return NextResponse.next();
  }

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Verifikasi JWT ───────────────────────────────────────────────────────────
  const user = await verifyToken(token);
  if (!user) {
    return clearSessionAndRedirect(new URL("/login", request.url));
  }

  // ── Hanya check auto-logout & force-logout untuk page routes ────────────────
  const isPageRoute = !pathname.startsWith("/api/");

  if (isPageRoute) {
    // Check 1: Auto-logout jam 03:00 WIB
    const issuedAt: number = (user as any).iat ?? 0;
    const autoLogoutThreshold = getAutoLogoutThreshold();
    if (issuedAt > 0 && issuedAt < autoLogoutThreshold) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("reason", "session_expired");
      return clearSessionAndRedirect(loginUrl);
    }

    // Check 2: Admin force-logout
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );
      const { data: userRecord } = await supabase
        .from("users")
        .select("force_logout_at")
        .eq("id", (user as any).id)
        .maybeSingle();

      if (userRecord?.force_logout_at) {
        const forceLogoutAtSec = new Date(userRecord.force_logout_at).getTime() / 1000;
        if (issuedAt < forceLogoutAtSec) {
          const loginUrl = new URL("/login", request.url);
          loginUrl.searchParams.set("reason", "force_logout");
          return clearSessionAndRedirect(loginUrl);
        }
      }
    } catch {
      // DB error → lanjut saja (fail-open)
    }
  }

  // ── Attendance check ─────────────────────────────────────────────────────────
  if (PROTECTED_PREFIXES.some(p => pathname.startsWith(p))) {
    const exempt = isAttendanceExempt(user.role as string);
    const hasAttended = hasAttendanceBypass(request, user.id);
    if (!exempt && isWithinSystemHours() && !hasAttended) {
      return NextResponse.redirect(
        new URL(`/face-verify?from=${encodeURIComponent(pathname)}`, request.url)
      );
    }
  }

  // ── Route permission check ───────────────────────────────────────────────────
  const matchedRoute = Object.keys(ROUTE_PERMISSIONS)
    .filter(route => pathname.startsWith(route))
    .sort((a, b) => b.length - a.length)[0];

  if (matchedRoute) {
    const allowed = ROUTE_PERMISSIONS[matchedRoute];
    if (!allowed.includes(user.role as UserRole)) {
      return NextResponse.redirect(
        new URL(ROLE_DEFAULT_REDIRECT[user.role as UserRole], request.url)
      );
    }
  }

  // ── Pass headers ke downstream ───────────────────────────────────────────────
  const response = NextResponse.next();
  response.headers.set("x-user-id", user.id);
  response.headers.set("x-user-role", user.role);
  response.headers.set("x-user-name", user.name);
  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/payment/:path*",
    "/receipt/:path*",
    "/scan/:path*",
    "/login",
    "/face-verify",
    "/api/auth/:path*",
    "/api/laptops/:path*",
    "/api/dashboard/:path*",
    "/api/transaction/:path*",
    "/api/units/:path*",
    "/api/warranty/:path*",
    "/api/reports/:path*",
    "/dashboard/warranty/:path*",
    "/api/attendance/:path*",
    "/api/messages/:path*", // ✅ NEW
    "/api/presence",
    "/api/group-chat",
  ],
};