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
import { checkDynamicPageAccess, expandDynamicParents } from "@/lib/dynamicPermissions";
import { CONTRACT_GATE_ENABLED } from "@/lib/featureFlags";
import { withTimeout } from "@/lib/withTimeout";
import { fetchWithTimeout } from "@/lib/supabaseFetchWithTimeout";
import { isRateLimited } from "@/lib/rateLimit";

// Batas waktu tiap call Supabase di middleware. Middleware jalan di HAMPIR
// SETIAP request, jadi kalau Supabase lambat/hang, ini yang mencegah request
// nge-gantung sampai proxy di depan (nginx/LiteSpeed) motong paksa (408).
const SUPABASE_TIMEOUT_MS = 5000;

const PUBLIC_ROUTES = ["/login", "/api/auth/login", "/api/auth/logout"];
// ✅ SECURITY FIX: `/receipt/` DULU publik penuh — halaman struk `/receipt/INV-...`
// bisa dibuka siapa saja tanpa login, padahal nomor invoice berurutan & mudah
// ditebak → data pelanggan (nama/HP/alamat/nominal) bisa dipanen dengan enumerasi.
// Faktanya link struk HANYA dipakai dari halaman dashboard/payment (staff login);
// pelanggan cuma menerima RINGKASAN TEKS via WA, bukan URL halaman ini. Jadi
// struk transaksi sekarang wajib login. `/receipt/salary-slip/` tetap publik
// (pakai UUID acak, bukan enumerable) agar perilaku slip gaji tidak berubah.
const PUBLIC_PREFIXES = ["/receipt/salary-slip/", "/scan/"];
const PUBLIC_API_ROUTES = [
  "/api/warranty/check",
  "/api/auth/set-password",
  "/api/service/stream",
  "/api/service/public",
  "/api/public/catalog",
  "/api/webhooks/whatsapp",
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

// ── Pembatasan khusus 1 akun: Raffi Fahrezi (PKL_PENGELOLA_BARANG) hanya
// boleh buka halaman Data Laptop untuk cari unit + toggle SO/UnSO. Blok ini
// SELALU mengurangi akses (AND tambahan setelah cek role normal di bawah),
// tidak pernah menambah — jadi kalau role-nya nanti berubah dan ROUTE_PERMISSIONS
// sudah tidak mengizinkan sebuah path, blok ini tetap konsisten (tidak override).
const SO_ONLY_USER_IDS = ["203810b5-f9e0-4de4-9495-e1378451fa29"];

// Domain yang dibatasi buat akun di atas — di luar prefix ini akses jalan normal
// (absensi, chat, profil, dsb SAMA SEKALI tidak disentuh).
const SO_ONLY_DOMAIN_PREFIXES = [
  "/dashboard/data-barang",
  "/dashboard/accessories",
  "/dashboard/units",
  "/dashboard/laptops",
  "/api/laptops",
  "/api/accessories",
  "/api/item-outflows",
  "/api/units",
];

function isSoOnlyRestrictedPath(pathname: string): boolean {
  const inDomain = SO_ONLY_DOMAIN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (!inDomain) return false;

  // Halaman Data Laptop (list + tombol SO)
  if (pathname === "/dashboard/laptops") return false;
  // GET list laptop
  if (pathname === "/api/laptops") return false;
  // Halaman Units per-model (cari unit saat stok > 1)
  if (/^\/dashboard\/laptops\/[^/]+\/units$/.test(pathname)) return false;
  // GET units per-model + GET/PATCH SO (toggle & riwayat)
  if (/^\/api\/laptops\/[^/]+\/units$/.test(pathname)) return false;
  if (/^\/api\/laptops\/[^/]+\/so$/.test(pathname)) return false;
  // GET detail 1 laptop by id (dipakai saat buka Detail/Unit popup)
  if (/^\/api\/laptops\/[^/]+$/.test(pathname) && pathname !== "/api/laptops/create" && pathname !== "/api/laptops/minus") return false;
  // ✅ FIX: SO per-unit (GET riwayat & PATCH toggle) di halaman Units —
  // sebelumnya belum di-whitelist di sini, padahal niat pembatasan akun ini
  // (lihat komentar SO_ONLY_USER_IDS) memang boleh "toggle SO/UnSO". Tanpa
  // baris ini, tombol SO di /dashboard/laptops/[id]/units selalu 403 untuk
  // akun ini walau halamannya sendiri bisa dibuka.
  if (/^\/api\/units\/[^/]+\/so$/.test(pathname)) return false;

  return true; // selain itu (data-barang, accessories, units summary, ready, minus, monitoring, dll) → blocked
}

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
      { auth: { persistSession: false }, global: { fetch: fetchWithTimeout } }
    );
    const { data, error } = await withTimeout<{
      data: { contract_status?: string | null; contract_valid_until?: string | null } | null;
      error: { message: string } | null;
    }>(
      supabase
        .from("users")
        .select("contract_status, contract_valid_until")
        .eq("id", userId)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      { data: null, error: { message: "timeout" } }
    );
    // Query nge-hang (bukan error dilempar, cuma gak pernah resolve) ->
    // fail-closed, sama kayak behavior `catch` di bawah, daripada nunggu
    // tanpa batas sampai proxy motong koneksinya.
    if (error) return false;

    const status = data?.contract_status ?? "NONE";
    if (status === "NONE") return true;
    if (status !== "APPROVED") return false;

    const validUntil = data?.contract_valid_until ?? null;
    if (validUntil) {
      const todayWIB = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (validUntil < todayWIB) {
        supabase.from("users").update({ contract_status: "EXPIRED" }).eq("id", userId).then(() => { });
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
      { auth: { persistSession: false }, global: { fetch: fetchWithTimeout } }
    );
    const todayDate = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const dayStart = `${todayDate}T00:00:00+07:00`;
    const dayEnd = `${todayDate}T23:59:59+07:00`;

    const TIMED_OUT = Symbol("timed_out");
    type MaybeRow = { data: { id: string } | null; error: unknown };
    const result = await withTimeout<[MaybeRow, MaybeRow, MaybeRow] | typeof TIMED_OUT>(
      Promise.all([
        supabase.from("face_verifications").select("id")
          .eq("user_id", userId).eq("status", "SUCCESS").eq("direction", "IN")
          .gte("created_at", dayStart).lte("created_at", dayEnd).maybeSingle(),
        supabase.from("attendance_manual").select("id")
          .eq("user_id", userId).eq("attendance_date", todayDate).maybeSingle(),
        supabase.from("user_leave_requests").select("id")
          .eq("user_id", userId).eq("leave_date", todayDate).eq("status", "APPROVED").maybeSingle(),
      ]),
      SUPABASE_TIMEOUT_MS,
      TIMED_OUT
    );
    // Nge-hang -> fail-closed (sama kayak catch di bawah): tetap minta
    // verifikasi ulang daripada request-nya gantung nunggu proxy motong.
    if (result === TIMED_OUT) return false;

    const [{ data: faceIn }, { data: manual }, { data: leave }] = result;
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

  // ── Rate limit dasar (anti-flood) ───────────────────────────────────────────
  // ✅ SECURITY FIX: dulu tidak ada rate limit sama sekali di level middleware —
  // semua request (termasuk /api/auth/login yang mahal karena bcrypt) diproses
  // penuh sebelum ada pengecekan apa pun. Ini BUKAN pengganti proteksi DDoS
  // infra (Cloudflare/WAF di depan reverse proxy) — serangan volumetrik/
  // terdistribusi dari banyak IP tetap harus ditahan di situ. Tapi karena app
  // ini jalan sebagai satu proses Node di belakang reverse proxy (bukan edge
  // multi-instance), rate limit in-memory di sini efektif menahan flood dari
  // satu/segelintir sumber (script abuse, scanner) sebelum sempat menyentuh
  // DB atau hitung bcrypt — mengurangi biaya server per request jahat.
  const rlIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(`mw-global:${rlIp}`, 400, 10_000)) {
    return NextResponse.json(
      { success: false, message: "Terlalu banyak request, coba lagi sebentar lagi" },
      { status: 429 }
    );
  }
  if (pathname === "/api/auth/login" && isRateLimited(`mw-login:${rlIp}`, 15, 10_000)) {
    return NextResponse.json(
      { success: false, message: "Terlalu banyak percobaan login, coba lagi sebentar lagi" },
      { status: 429 }
    );
  }

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
        // Cek kontrak SENGAJA tidak dilakukan di sini — semua nilai
        // ROLE_DEFAULT_REDIRECT ada di bawah "/dashboard", jadi query
        // Supabase yang sama pasti kepanggil lagi begitu redirect di bawah
        // ini "kena" blok PROTECTED_PREFIXES. Dulu di sini ada cek
        // hasApprovedContract() terpisah yang query PERSIS sama ke tabel
        // users, jadi tiap kali user (yang sudah login) buka "/" -> "/login"
        // -> "/dashboard" bakal ada 2x round-trip Supabase berurutan buat
        // data yang sama — nambah latensi & resiko timeout tanpa guna.
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

  const isPageRoute = !pathname.startsWith("/api/");

  // Method HTTP nentuin action yang dicek ke matrix Role & Hak Akses
  // (GET = view, POST = create, PUT/PATCH = edit, DELETE = delete).
  // Sebelumnya selalu "view" di checkDynamicPageAccess(), jadi kolom
  // Create/Edit/Delete di matrix gak pernah kebaca sama sekali.
  const dynamicAction: "view" | "create" | "edit" | "delete" =
    request.method === "POST"
      ? "create"
      : request.method === "PUT" || request.method === "PATCH"
        ? "edit"
        : request.method === "DELETE"
          ? "delete"
          : "view";

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

  // ── Force logout check — sekarang berlaku untuk SEMUA route (page & API) ──
  // ✅ SECURITY FIX: dulu blok ini cuma jalan `if (isPageRoute)` — admin yang
  // klik "Force Logout" mengira sesi langsung terputus, padahal request
  // API langsung (fetch/XHR dari tab yang sudah terbuka, bukan reload
  // halaman) tetap lolos sampai token kedaluwarsa alami. Throttle "max 1x
  // per 5 menit" tetap dipertahankan supaya biaya query DB tidak naik.
  let shouldRefreshFlCookie = false;

  {
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
          { auth: { persistSession: false }, global: { fetch: fetchWithTimeout } }
        );
        const { data: userRecord } = await withTimeout<{
          data: { force_logout_at?: string | null } | null;
          error: unknown;
        }>(
          supabase
            .from("users")
            .select("force_logout_at")
            .eq("id", user.id)
            .maybeSingle(),
          SUPABASE_TIMEOUT_MS,
          { data: null, error: null }
        );

        if (userRecord?.force_logout_at) {
          const forceLogoutAtSec =
            new Date(userRecord.force_logout_at).getTime() / 1000;
          const BUFFER_SECONDS = 5;
          if (issuedAt < forceLogoutAtSec - BUFFER_SECONDS) {
            if (!isPageRoute) {
              const res = NextResponse.json(
                { success: false, message: "Sesi dihentikan paksa (force logout), silakan login ulang", reason: "force_logout" },
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
        new URL(`/face-veripfy?from=${encodeURIComponent(pathname)}`, request.url)
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
    .filter((route) => pathname === route || pathname.startsWith(route + "/"))
    .sort((a, b) => b.length - a.length)[0];

  let hasRouteAccess: boolean;

  const dyn = await checkDynamicPageAccess(fullyExpandedRoles, pathname, dynamicAction);

  if (dyn.configured) {
    hasRouteAccess = dyn.allowed;
  } else if (matchedRoute) {
    const allowed = ROUTE_PERMISSIONS[matchedRoute];
    hasRouteAccess = effectiveRoles.some((r: string) => (allowed as string[]).includes(r));
  } else if (dyn.matched) {
    hasRouteAccess = false;
  } else {
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

  // ── Gate tambahan: akun SO-only (lihat SO_ONLY_USER_IDS di atas) ──────────
  if (SO_ONLY_USER_IDS.includes(user.id) && isSoOnlyRestrictedPath(pathname)) {
    if (!isPageRoute) {
      return NextResponse.json(
        { success: false, message: "Forbidden: akun ini hanya diizinkan mengakses fitur SO" },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/dashboard/laptops", request.url));
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
    "/api/cashflow/:path*",
    "/dashboard/warranty/:path*",
    "/api/attendance/:path*",
    "/api/pkl-reports/:path*",
    "/dashboard/pkl-reports/:path*",
    "/api/messages/:path*",
    "/api/presence",
    "/api/group-chat",
    "/api/push/subscribe",
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
    "/dashboard/fixed-assets/:path*",
    "/api/fixed-assets/:path*",
    "/api/dead-assets/:path*",
    "/dashboard/ai-ceo/:path*",
    "/api/ai-ceo/:path*",
    "/dashboard/tanya-ceo/:path*",
    "/api/ai-assistant/:path*",
    "/api/admin/roles/:path*",
    "/api/admin/pages/:path*",
    "/api/admin/role-permissions/:path*",
    "/dashboard/profile/:path*",
    "/api/profile/:path*",
    "/api/achievements/:path*",
    "/api/leads-chat/:path*",
    "/api/webhooks/:path*",
  ],
};