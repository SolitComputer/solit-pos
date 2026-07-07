// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  verifyToken,
  ROUTE_PERMISSIONS,
  ROLE_DEFAULT_REDIRECT,
  UserRole,
} from "@/lib/auth";
import {
  expandRolesWithParents,
  getEffectivePrimaryRole,
} from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

const PUBLIC_ROUTES = ["/login", "/api/auth/login", "/api/auth/logout"];
const PUBLIC_PREFIXES = ["/receipt/", "/scan/"];
const PUBLIC_API_ROUTES = [
  "/api/warranty/check",
  "/api/auth/set-password",
  "/api/service/stream",
  "/api/service/public",
  "/api/public/catalog",
];

const FACE_API_WHITELIST = [
  "/api/auth/face-verify",
  "/api/auth/face-enroll",
  "/api/auth/face-status",
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/login",
  "/api/presence",
  "/api/push/subscribe",
];

const PKL_BLOCKED_ROUTES = ["/dashboard/users"];

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

function getAutoLogoutThreshold(): number {
  const nowUTC = Date.now();
  const nowWIB = new Date(nowUTC + 7 * 3600_000);
  const wibHour = nowWIB.getUTCHours();
  const y = nowWIB.getUTCFullYear();
  const mo = nowWIB.getUTCMonth();
  const d = nowWIB.getUTCDate();
  const thresholdUTC =
    wibHour >= 3
      ? Date.UTC(y, mo, d, -4, 0, 0)
      : Date.UTC(y, mo, d - 1, -4, 0, 0);
  return Math.floor(thresholdUTC / 1000);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("token")?.value;

  // ── Public routes ──────────────────────────────────────────────────────────
  if (PUBLIC_ROUTES.includes(pathname)) {
    if (token && pathname === "/login") {
      const user = await verifyToken(token);
      if (user) {
        const exempt = isAttendanceExempt(user.role as string);
        const hasAttended = hasAttendanceBypass(request, user.id);
        if (!exempt && isWithinSystemHours() && !hasAttended) {
          return NextResponse.redirect(new URL("/face-verify", request.url));
        }
        const userRoles: string[] = user.roles ?? [user.role];
        // ✅ PKL variant pakai redirect parent role-nya
        const effectivePrimary = getEffectivePrimaryRole(userRoles);
        return NextResponse.redirect(
          new URL(
            ROLE_DEFAULT_REDIRECT[effectivePrimary] ?? "/dashboard",
            request.url
          )
        );
      }
    }
    return NextResponse.next();
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/face-verify")) {
    if (!token) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next();
  }

  if (PUBLIC_API_ROUTES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (FACE_API_WHITELIST.some((p) => pathname.startsWith(p))) {
    if (!token) return NextResponse.json({ success: false }, { status: 401 });
    return NextResponse.next();
  }

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Verifikasi JWT ─────────────────────────────────────────────────────────
  const user = await verifyToken(token);
  if (!user) {
    return clearSessionAndRedirect(new URL("/login", request.url));
  }

  const userRoles: string[] = user.roles ?? [user.role];
  // ✅ Expand: PKL_SALES → ["PKL_SALES", "CREW_SALES"], dst.
  const effectiveRoles = expandRolesWithParents(userRoles);
  const effectivePrimary = getEffectivePrimaryRole(userRoles);

  const isPageRoute = !pathname.startsWith("/api/");

  // ── Auto logout & force logout check (page routes only) ───────────────────
  // ✅ throttle cek force_logout: max 1x / 5 menit per sesi
  let shouldRefreshFlCookie = false;

  if (isPageRoute) {
    const issuedAt: number = (user as any).iat ?? 0;
    const autoLogoutThreshold = getAutoLogoutThreshold();
    if (issuedAt > 0 && issuedAt < autoLogoutThreshold) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("reason", "session_expired");
      return clearSessionAndRedirect(loginUrl);
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const lastFlCheck = Number(request.cookies.get("fl_check")?.value ?? 0);
    const FL_CHECK_INTERVAL = 300; // 5 menit

    // hanya query DB kalau sudah lewat interval → hemat invocation & CPU
    if (nowSec - lastFlCheck > FL_CHECK_INTERVAL) {
      shouldRefreshFlCookie = true;
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false } }
        );
        const { data: userRecord } = await supabase
          .from("users")
          .select("force_logout_at")
          .eq("id", user.id)
          .maybeSingle();

        if (userRecord?.force_logout_at) {
          const forceLogoutAtSec =
            new Date(userRecord.force_logout_at).getTime() / 1000;
          const BUFFER_SECONDS = 5;
          if (issuedAt < forceLogoutAtSec - BUFFER_SECONDS) {
            const loginUrl = new URL("/login", request.url);
            loginUrl.searchParams.set("reason", "force_logout");
            return clearSessionAndRedirect(loginUrl);
          }
        }
      } catch {
        // fail-open: jangan block kalau DB tidak bisa diakses
      }
    }
  }

  // ── Attendance / face-verify gate ─────────────────────────────────────────
  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const exempt = isAttendanceExempt(user.role as string);
    const hasAttended = hasAttendanceBypass(request, user.id);
    if (!exempt && isWithinSystemHours() && !hasAttended) {
      return NextResponse.redirect(
        new URL(`/face-verify?from=${encodeURIComponent(pathname)}`, request.url)
      );
    }
  }

  // ── PKL block: hanya block jika SEMUA effective roles adalah PKL polos ────
  // ✅ Pakai effectiveRoles:
  //   - PKL_SALES → effectiveRoles = ["PKL_SALES", "CREW_SALES"] → NOT allPKL → LOLOS
  //   - PKL polos → effectiveRoles = ["PKL"] → allPKL → BLOCKED
  const allPKL = effectiveRoles.every(
    (r: string) => r === "PKL" || r.startsWith("PKL_")
  );
  if (allPKL && PKL_BLOCKED_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // ── Route permission check ────────────────────────────────────────────────
  // ✅ Pakai effectiveRoles: PKL_MARKETING akan lolos di route yang allow MARKETING
  const matchedRoute = Object.keys(ROUTE_PERMISSIONS)
    .filter((route) => pathname.startsWith(route))
    .sort((a, b) => b.length - a.length)[0];

  if (matchedRoute) {
    const allowed = ROUTE_PERMISSIONS[matchedRoute];
    const hasAccess = effectiveRoles.some((r: string) =>
      (allowed as string[]).includes(r)
    );
    if (!hasAccess) {
      return NextResponse.redirect(
        new URL(
          ROLE_DEFAULT_REDIRECT[effectivePrimary] ?? "/dashboard",
          request.url
        )
      );
    }
  }

  // ── Inject user headers untuk API routes ──────────────────────────────────
  // NOTE: header pakai roles ASLI (bukan effective) supaya API tahu role sebenarnya.
  // Permission check di API dilakukan di withAuth() yang juga expand parent.
  const response = NextResponse.next();
  response.headers.set("x-user-id", user.id);
  response.headers.set("x-user-role", user.role);
  response.headers.set("x-user-roles", userRoles.join(","));
  response.headers.set("x-user-name", user.name);

  // ✅ tandai kapan terakhir cek force_logout
  if (shouldRefreshFlCookie) {
    response.cookies.set("fl_check", String(Math.floor(Date.now() / 1000)), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  }

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
    "/api/pkl-reports/:path*",
    "/dashboard/pkl-reports/:path*",
    "/api/messages/:path*",
    "/api/presence",
    "/api/group-chat",
    "/api/service/:path*",
    "/api/accessories/:path*",
    "/dashboard/accessories/:path*",
    "/api/seller-followups/:path*",
    "/dashboard/preparation/:path*",
    "/api/preparation/:path*",
    "/api/missions/:path*",
  ],
};