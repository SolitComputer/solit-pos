import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  verifyToken,
  ROUTE_PERMISSIONS,
  ROLE_DEFAULT_REDIRECT,
  UserRole,
  isAttendanceTime,
} from "@/lib/auth";

const PUBLIC_ROUTES = ["/login", "/api/auth/login", "/api/auth/logout"];
const PUBLIC_PREFIXES = ["/receipt/", "/scan/"];
const PUBLIC_API_ROUTES = ["/api/warranty/check"];

const FACE_API_WHITELIST = [
  "/api/auth/face-verify",
  "/api/auth/face-enroll",
  "/api/auth/face-status",
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/login",
];

const PROTECTED_PREFIXES = ["/dashboard", "/payment"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("token")?.value;
  const faceAttended = request.cookies.get("face_attended")?.value; // ← Cookie baru

  // ── Public routes ──
  if (PUBLIC_ROUTES.includes(pathname)) {
    if (token && pathname === "/login") {
      const user = await verifyToken(token);
      if (user) {
        // Cek apakah harus absen dulu
        if (isAttendanceTime() && !faceAttended) {
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

  // ── Public prefixes ──
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // ── Face Verify Page ──
  if (pathname.startsWith("/face-verify")) {
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  // ── Public API routes ──
  if (PUBLIC_API_ROUTES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // ── Face API Whitelist ──
  if (FACE_API_WHITELIST.some((p) => pathname.startsWith(p))) {
    if (!token) {
      return NextResponse.json({ success: false }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── Require Token ──
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const user = await verifyToken(token);
  if (!user) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("token");
    return response;
  }

  // ── ATTENDANCE GUARD (Wajib Absen Wajah) ──
  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (isAttendanceTime() && faceAttended !== user.id) {
      return NextResponse.redirect(
        new URL(`/face-verify?from=${encodeURIComponent(pathname)}`, request.url)
      );
    }
  }

  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const faceAttended = request.cookies.get("face_attended")?.value;
    const faceVerified = request.cookies.get("face_verified")?.value;
    const hasAttended = faceAttended === user.id || faceVerified === user.id;

    if (isAttendanceTime() && !hasAttended) {
      return NextResponse.redirect(
        new URL(`/face-verify?from=${encodeURIComponent(pathname)}`, request.url)
      );
    }
  }

  // ── Route Permission Check ──
  const matchedRoute = Object.keys(ROUTE_PERMISSIONS)
    .filter((route) => pathname.startsWith(route))
    .sort((a, b) => b.length - a.length)[0];

  if (matchedRoute) {
    const allowed = ROUTE_PERMISSIONS[matchedRoute];
    if (!allowed.includes(user.role as UserRole)) {
      return NextResponse.redirect(
        new URL(ROLE_DEFAULT_REDIRECT[user.role as UserRole], request.url)
      );
    }
  }

  // ── Forward user info ──
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
  ],
};