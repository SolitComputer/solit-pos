// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  verifyToken,
  ROUTE_PERMISSIONS,
  ROLE_DEFAULT_REDIRECT,
  UserRole,
  verifyAttendanceCookie,
} from "@/lib/auth";
import {
  expandRolesWithParents,
  getEffectivePrimaryRole,
} from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";
import { ALL_STATIC_ROLES } from "@/lib/permissions";
import { checkDynamicPageAccess, expandDynamicParents } from "@/lib/dynamicPermissions";

const PUBLIC_ROUTES = ["/login", "/api/auth/login", "/api/auth/logout"];
const PUBLIC_PREFIXES = ["/receipt/", "/scan/"];
const PUBLIC_API_ROUTES = [
  "/api/warranty/check",
  "/api/auth/set-password",
  "/api/service/stream",
  "/api/service/public",
  "/api/public/catalog",
];
const CRON_ROUTES = [
  "/api/cc-reports/sync",
  "/api/cc-reports/tiktok/keepalive",
  "/api/cc-reports/tiktok/status",
  "/api/cc-reports/instagram/keepalive",
  "/api/cc-reports/instagram/status",
];

function isCronRoute(pathname: string): boolean {
  return CRON_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}
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

async function hasAttendanceBypass(
  request: NextRequest,
  userId: string
): Promise<boolean> {
  const values = [
    request.cookies.get("face_attended")?.value,
    request.cookies.get("face_verified")?.value,
    request.cookies.get("attendance_skipped")?.value,
    request.cookies.get("day_off_today")?.value,
  ];
  for (const v of values) {
    if (await verifyAttendanceCookie(v, userId)) return true;
  }
  return false;
}

const SESSION_COOKIES = [
  "token",
  "face_attended",
  "face_verified",
  "attendance_skipped",
  "day_off_today",
  "fl_check",
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

const IDENTITY_HEADERS = [
  "x-user-id",
  "x-user-role",
  "x-user-roles",
  "x-user-name",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const url = request.nextUrl.clone();

  // ── Strip client-supplied identity headers (anti-spoof) ────────────────────
  // Tanpa ini, siapa pun bisa kirim header `x-user-roles: ADMIN` dan route yang
  // baca header itu akan percaya. Kita bikin salinan header request yang bersih;
  // satu-satunya sumber identitas yang tepercaya adalah JWT yang kita verifikasi.
  const requestHeaders = new Headers(request.headers);
  for (const h of IDENTITY_HEADERS) requestHeaders.delete(h);
  const forward = () =>
    NextResponse.next({ request: { headers: requestHeaders } });
  if (url.searchParams.has("_cb")) {
    url.searchParams.delete("_cb");
    return NextResponse.redirect(url);
  }
  const token = request.cookies.get("token")?.value;

  // ── Public routes ──────────────────────────────────────────────────────────
  if (PUBLIC_ROUTES.includes(pathname)) {
    if (token && pathname === "/login") {
      const user = await verifyToken(token);
      if (user) {
        const exempt = isAttendanceExempt(user.role as string);
        const hasAttended = await hasAttendanceBypass(request, user.id);
        if (!exempt && isWithinSystemHours() && !hasAttended) {
          return NextResponse.redirect(new URL("/face-verify", request.url));
        }
        const userRoles: string[] = user.roles ?? [user.role];
        //  PKL variant pakai redirect parent role-nya
        const effectivePrimary = getEffectivePrimaryRole(userRoles);
        return NextResponse.redirect(
          new URL(
            ROLE_DEFAULT_REDIRECT[effectivePrimary] ?? "/dashboard",
            request.url
          )
        );
      }
    }
    return forward();
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return forward();
  }

  if (pathname.startsWith("/face-verify")) {
    if (!token) return NextResponse.redirect(new URL("/login", request.url));
    return forward();
  }

  if (PUBLIC_API_ROUTES.some((p) => pathname.startsWith(p))) {
    return forward();
  }

  if (FACE_API_WHITELIST.some((p) => pathname.startsWith(p))) {
    if (!token) return NextResponse.json({ success: false }, { status: 401 });
    return forward();
  }

  if (isCronRoute(pathname)) {
    const cronSecret = request.headers.get("x-cron-secret");
    if (cronSecret) {
      if (cronSecret === process.env.CRON_SECRET) {
        return forward();
      }
      return NextResponse.json(
        { success: false, error: "Invalid cron secret" },
        { status: 401 }
      );
    }
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
  //  Expand: PKL_SALES → ["PKL_SALES", "CREW_SALES"], dst.
  const effectiveRoles = expandRolesWithParents(userRoles);
  const effectivePrimary = getEffectivePrimaryRole(userRoles);

  const fullyExpandedRoles = await expandDynamicParents(effectiveRoles);
  const hasDynamicRole = fullyExpandedRoles.some((r) => !ALL_STATIC_ROLES.includes(r));

  const isPageRoute = !pathname.startsWith("/api/");

  // ── Auto logout & force logout check (page routes only) ───────────────────
  let shouldRefreshFlCookie = false;

  if (isPageRoute) {
    const issuedAt: number = (user as any).iat ?? 0;
    const autoLogoutThreshold = getAutoLogoutThreshold();
    if (issuedAt > 0 && issuedAt < autoLogoutThreshold) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("reason", "session_expired");
      return clearSessionAndRedirect(loginUrl);
    }

    //  throttle cek force_logout: max 1x per 5 menit per sesi
    const nowSec = Math.floor(Date.now() / 1000);
    const lastFlCheck = Number(request.cookies.get("fl_check")?.value ?? 0);
    const FL_CHECK_INTERVAL = 300; // 5 menit

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
    const hasAttended = await hasAttendanceBypass(request, user.id);
    if (!exempt && isWithinSystemHours() && !hasAttended) {
      return NextResponse.redirect(
        new URL(`/face-verify?from=${encodeURIComponent(pathname)}`, request.url)
      );
    }
  }

  // ── PKL block: hanya block jika SEMUA effective roles adalah PKL polos ────
  //  Pakai effectiveRoles:
  //   - PKL_SALES → effectiveRoles = ["PKL_SALES", "CREW_SALES"] → NOT allPKL → LOLOS
  //   - PKL polos → effectiveRoles = ["PKL"] → allPKL → BLOCKED
  const allPKL = effectiveRoles.every(
    (r: string) => r === "PKL" || r.startsWith("PKL_")
  );
  if (allPKL && PKL_BLOCKED_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const matchedRoute = Object.keys(ROUTE_PERMISSIONS)
    .filter((route) => pathname.startsWith(route))
    .sort((a, b) => b.length - a.length)[0];

  let hasRouteAccess: boolean;

  if (matchedRoute) {
    const allowed = ROUTE_PERMISSIONS[matchedRoute];
    hasRouteAccess = effectiveRoles.some((r: string) => (allowed as string[]).includes(r));


    if (!hasRouteAccess && hasDynamicRole) {
      const dyn = await checkDynamicPageAccess(fullyExpandedRoles, pathname, "view");
      if (dyn.matched) hasRouteAccess = dyn.allowed;
    }
  } else if (hasDynamicRole) {

    const dyn = await checkDynamicPageAccess(fullyExpandedRoles, pathname, "view");
    hasRouteAccess = dyn.matched ? dyn.allowed : true;
  } else {
    // Role statis, halaman tidak ada di ROUTE_PERMISSIONS -> perilaku lama (izinkan).
    hasRouteAccess = true;
  }

  if (!hasRouteAccess) {
    return NextResponse.redirect(
      new URL(ROLE_DEFAULT_REDIRECT[effectivePrimary] ?? "/dashboard", request.url)
    );
  }

  // ── Inject user headers untuk API routes ──────────────────────────────────
  // NOTE: header pakai roles ASLI (bukan effective) supaya API tahu role sebenarnya.
  // Permission check di API dilakukan di withAuth() yang juga expand parent.
  // PENTING: header di-set pada REQUEST yang diteruskan (requestHeaders), bukan
  // pada response. `requestHeaders` sudah dibersihkan dari salinan kiriman client
  // di awal middleware, jadi route hanya melihat identitas tepercaya dari JWT.
  requestHeaders.set("x-user-id", user.id);
  requestHeaders.set("x-user-role", user.role);
  requestHeaders.set("x-user-roles", userRoles.join(","));
  requestHeaders.set("x-user-name", encodeURIComponent(user.name));
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Refresh throttle cookie force-logout (kalau barusan dicek ke DB).
  if (shouldRefreshFlCookie) {
    response.cookies.set("fl_check", String(Math.floor(Date.now() / 1000)), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
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
    "/api/chat-groups/:path*",
    "/api/service/:path*",
    "/api/accessories/:path*",
    "/api/item-outflows/:path*",
    "/dashboard/accessories/:path*",
    "/api/seller-followups/:path*",
    "/api/seller-pics/:path*",
    "/dashboard/preparation/:path*",
    "/api/preparation/:path*",
    "/api/missions/:path*",
    "/dashboard/cc-reports/:path*",
    "/api/cc-reports/:path*",
    "/dashboard/todos/:path*",
    "/api/todos/:path*",
    "/dashboard/akuntansi/:path*",
    "/api/akutansi/:path*",
    "/dashboard/ai-ceo/:path*",
    "/api/ai-ceo/:path*",
    "/dashboard/profile/:path*",
    "/api/profile/:path*",
    "/api/achievements/:path*",
  ],
};