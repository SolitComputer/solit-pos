import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken, ROUTE_PERMISSIONS, UserRole } from "@/lib/auth";

const PUBLIC_ROUTES = ["/login", "/api/auth/login"];
const PUBLIC_PREFIXES = ["/receipt/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("token")?.value;

  if (PUBLIC_ROUTES.includes(pathname)) {
    if (token && pathname === "/login") {
      const user = await verifyToken(token);
      if (user) {
        return NextResponse.redirect(
          new URL(
            user.role === "ADMIN"
              ? "/dashboard"
              : user.role === "OPERATOR"
                ? "/dashboard/laptops"
                : "/payment/create",
            request.url
          )
        );
      }
    }
    return NextResponse.next();
  }

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

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

  const matchedRoute = Object.keys(ROUTE_PERMISSIONS)
    .filter((route) => pathname.startsWith(route))
    .sort((a, b) => b.length - a.length)[0];

  if (matchedRoute) {
    const allowed = ROUTE_PERMISSIONS[matchedRoute];
    if (!allowed.includes(user.role as UserRole)) {
      const fallback =
        user.role === "ADMIN"
          ? "/dashboard"
          : user.role === "OPERATOR"
            ? "/dashboard/laptops"
            : "/payment/create";
      return NextResponse.redirect(
        new URL(
          user.role === "ADMIN"
            ? "/dashboard"
            : user.role === "OPERATOR"
              ? "/dashboard/laptops"
              : "/payment/create",
          request.url
        )
      );
    }
  }

  const response = NextResponse.next();
  response.headers.set("x-user-id", user.id);
  response.headers.set("x-user-role", user.role);
  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/payment/:path*",
    "/receipt/:path*",
    "/login",
    "/api/laptops/:path*",
    "/api/dashboard/:path*",
    "/api/transaction/:path*",
  ],
};