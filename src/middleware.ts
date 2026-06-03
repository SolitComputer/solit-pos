import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  verifyToken,
  ROUTE_PERMISSIONS,
  ROLE_DEFAULT_REDIRECT,
  UserRole,
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

const FACE_PROTECTED_PREFIXES = ["/dashboard", "/payment"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("token")?.value;
  const faceVerified = request.cookies.get("face_verified")?.value;

  // ── Public routes ──
  if (PUBLIC_ROUTES.includes(pathname)) {
    if (token && pathname === "/login") {
      const user = await verifyToken(token);
      if (user) {
        // Kalau sudah login tapi belum face verify → ke /face-verify
        if (!faceVerified) {
          return NextResponse.redirect(new URL("/face-verify", request.url));
        }
        return NextResponse.redirect(
          new URL(ROLE_DEFAULT_REDIRECT[user.role], request.url)
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

  // ── Face API — hanya butuh token, tidak butuh face_verified ──
  if (FACE_API_WHITELIST.some((p) => pathname.startsWith(p))) {
    if (!token) {
      return NextResponse.json({ success: false }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── Require auth ──
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

  if (pathname.startsWith("/face-verify")) {
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const user = await verifyToken(token);
    if (!user) {
      const res = NextResponse.redirect(new URL("/login", request.url));
      res.cookies.delete("token");
      return res;
    }
    return NextResponse.next();
  }

  // ── Face verification guard untuk dashboard & payment ──
  if (FACE_PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (faceVerified !== user.id) {
      return NextResponse.redirect(
        new URL(`/face-verify?from=${encodeURIComponent(pathname)}`, request.url)
      );
    }
  }

  // ── Face verification guard ──
  if (FACE_PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (faceVerified !== user.id) {
      // Belum verifikasi wajah hari ini → redirect ke halaman verifikasi
      return NextResponse.redirect(
        new URL(`/face-verify?from=${encodeURIComponent(pathname)}`, request.url)
      );
    }
  }

  // ── Route permission check ──
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

  // ── Forward user info ke headers ──
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