// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  verifyToken,
  ROUTE_PERMISSIONS,
  ROLE_DEFAULT_REDIRECT,
  UserRole,
  verifyAttendanceCookie,
  signAttendanceCookie,
} from "@/lib/auth";
import {
  expandRolesWithParents,
  getEffectivePrimaryRole,
} from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";
import { ALL_STATIC_ROLES } from "@/lib/permissions";
import { checkDynamicPageAccess, expandDynamicParents } from "@/lib/dynamicPermissions";
import { CONTRACT_GATE_ENABLED } from "@/lib/featureFlags";

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
const CONTRACT_EXEMPT_ROLES = ["PROGRAMMER"];

function isAttendanceExempt(role?: string): boolean {
  return !!role && ATTENDANCE_EXEMPT_ROLES.includes(role);
}

function isContractExempt(role?: string): boolean {
  return !!role && CONTRACT_EXEMPT_ROLES.includes(role);
}

async function hasApprovedContract(userId: string): Promise<boolean> {
  if (!CONTRACT_GATE_ENABLED) return true; // 🔴 gate dimatikan sementara
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { data } = await supabase
      .from("users")
      .select("contract_status, contract_valid_until")
      .eq("id", userId)
      .maybeSingle();

   const status = data?.contract_status ?? "NONE";
    if (status === "NONE") return true;
    if (status !== "APPROVED") return false;

    const validUntil = data?.contract_valid_until ?? null;
    if (validUntil) {
      const todayWIB = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (validUntil < todayWIB) {
        supabase.from("users").update({ contract_status: "EXPIRED" }).eq("id", userId).then(() => {});
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
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

// ✅ NEW — fallback lintas-device: cookie absen itu per-browser, jadi kalau
// user pindah HP/browser di hari yang sama, cookie-nya kosong padahal DB
// sudah mencatat dia absen. Cek langsung ke DB supaya tidak diminta
// verifikasi wajah/sidik jari ulang di device lain.
async function hasAttendedTodayInDB(userId: string): Promise<boolean> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const todayDate = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const dayStart = `${todayDate}T00:00:00+07:00`;
    const dayEnd = `${todayDate}T23:59:59+07:00`;

    const [{ data: faceIn }, { data: manual }, { data: leave }] = await Promise.all([
      supabase.from("face_verifications").select("id")
        .eq("user_id", userId).eq("status", "SUCCESS").eq("direction", "IN")
        .gte("created_at", dayStart).lte("created_at", dayEnd).maybeSingle(),
      supabase.from("attendance_manual").select("id")
        .eq("user_id", userId).eq("attendance_date", todayDate).maybeSingle(),
      supabase.from("leave_requests").select("id")
        .eq("user_id", userId).eq("leave_date", todayDate).eq("status", "APPROVED").maybeSingle(),
    ]);

    return Boolean(faceIn || manual || leave);
  } catch {
    // fail-closed: kalau DB gak bisa diakses, tetap minta verifikasi seperti biasa
    return false;
  }
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
        if (!isContractExempt(user.role as string)) {
          const contractOk = await hasApprovedContract(user.id);
          if (!contractOk) {
            return NextResponse.redirect(new URL("/contract", request.url));
          }
        }

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

  if (pathname.startsWith("/biometric-enroll")) {
    if (!token) return NextResponse.redirect(new URL("/login", request.url));
    return forward();
  }

  if (pathname.startsWith("/contract")) {
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
  // ── Auto logout jam 3 pagi — sekarang berlaku untuk SEMUA route (page & API) ──
  // FIX: sebelumnya blok ini ada di dalam `if (isPageRoute)`, jadi request API
  // tanpa reload halaman tidak pernah kena auto-logout. Selain itu `iat` di
  // token sebelumnya selalu 0 karena belum dinormalisasi (lihat perbaikan di
  // lib/auth.ts) — jadi kondisi ini dulu memang tidak pernah kena sama sekali.
  const issuedAt: number = (user as any).iat ?? 0;
  const autoLogoutThreshold = getAutoLogoutThreshold();
  if (issuedAt > 0 && issuedAt < autoLogoutThreshold) {
    if (!isPageRoute) {
      const res = NextResponse.json(
        { success: false, message: "Sesi berakhir (auto-logout 03:00 WIB), silakan login ulang", reason: "session_expired" },
        { status: 401 }
      );
      for (const name of SESSION_COOKIES) {
        res.cookies.set(name, "", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 0,
        });
      }
      return res;
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("reason", "session_expired");
    return clearSessionAndRedirect(loginUrl);
  }

  // ── Force logout check (tetap page-route only, biar hemat query DB) ───────
  let shouldRefreshFlCookie = false;

  if (isPageRoute) {
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

  let shouldStampAttendanceCookie = false;

  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (!isContractExempt(user.role as string)) {
      const contractOk = await hasApprovedContract(user.id);
      if (!contractOk) {
        return NextResponse.redirect(new URL("/contract", request.url));
      }
    }

    const exempt = isAttendanceExempt(user.role as string);
    let hasAttended = await hasAttendanceBypass(request, user.id);

    if (!exempt && !hasAttended && isWithinSystemHours()) {
      hasAttended = await hasAttendedTodayInDB(user.id);
      if (hasAttended) shouldStampAttendanceCookie = true;
    }

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

    // Additive-only: kalau ROUTE_PERMISSIONS bilang tidak boleh, cek juga matrix
    // role_page_permissions (Role & Hak Akses di /dashboard/users) — berlaku buat
    // SEMUA role (bukan cuma yang punya dynamic role), tapi cuma bisa NAMBAH akses,
    // tidak pernah menguranginya (baris ini gak pernah dieksekusi kalau hasRouteAccess
    // sudah true dari ROUTE_PERMISSIONS).
    if (!hasRouteAccess) {
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
    if (!isPageRoute) {
      return NextResponse.json(
        { success: false, message: "Forbidden: role Anda tidak punya akses ke endpoint ini" },
        { status: 403 }
      );
    }
    return NextResponse.redirect(
      new URL(ROLE_DEFAULT_REDIRECT[effectivePrimary] ?? "/dashboard", request.url)
    );
  }

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


  if (shouldStampAttendanceCookie) {
    const signed = await signAttendanceCookie(user.id);
    const expiry = new Date();
    expiry.setHours(23, 59, 59, 999);
    for (const name of ["face_attended", "face_verified"]) {
      response.cookies.set(name, signed, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: expiry,
      });
    }
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
    "/biometric-enroll",
    "/contract",
    "/api/contracts/:path*",
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