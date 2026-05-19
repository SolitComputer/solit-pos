import {
  NextResponse,
} from "next/server";

import type {
  NextRequest,
} from "next/server";

import jwt
  from "jsonwebtoken";

export function proxy(
  request: NextRequest
) {

  const token =
    request.cookies.get(
      "token"
    )?.value;

  const pathname =
    request.nextUrl
      .pathname;

  const publicRoutes = [
    "/login",
    "/api/auth/login",
  ];

  const isPublic =
    publicRoutes.some(
      (
        route
      ) =>
        pathname.startsWith(
          route
        )
    );

  // ===================
  // CUSTOMER PUBLIC PAGE
  // ===================
  const isCustomerPage =
    pathname.startsWith("/receipt/") &&

    pathname !==
    "/payment/create"

    ||

    pathname.startsWith(
      "/receipt/"
    );

  // ===================
  // BELUM LOGIN
  // ===================
  if (
    !token &&
    !isPublic &&
    !isCustomerPage
  ) {

    return NextResponse.redirect(
      new URL(
        "/login",
        request.url
      )
    );
  }

  // ===================
  // SUDAH LOGIN
  // ===================
  if (token) {

    try {

      const user =
        jwt.verify(
          token,
          process.env
            .JWT_SECRET ||
          "secret"
        ) as {
          role:
          string;
        };

      // ===================
      // BLOCK LOGIN PAGE
      // ===================
      if (
        pathname ===
        "/login"
      ) {

        return NextResponse.redirect(
          new URL(
            user.role ===
              "ADMIN"
              ? "/dashboard"
              : "/payment/create",
            request.url
          )
        );
      }

      // ===================
      // SALES ACCESS
      // ===================
      if (
        user.role ===
        "SALES"
      ) {

        const allowedRoutes = [
          "/transaction/create",
          "/receipt/",
        ];

        const canAccess =
          allowedRoutes.some(
            (
              route
            ) =>
              pathname.startsWith(
                route
              )
          );

        if (
          !canAccess
        ) {

          return NextResponse.redirect(
            new URL(
              "/payment/create",
              request.url
            )
          );
        }
      }

      // ===================
      // ADMIN ACCESS
      // ===================
      if (
        user.role ===
        "ADMIN"
      ) {

        return NextResponse.next();
      }

    } catch {

      const response =
        NextResponse.redirect(
          new URL(
            "/login",
            request.url
          )
        );

      response.cookies.delete(
        "token"
      );

      return response;
    }
  }

  return NextResponse.next();
}

export const config =
{
  matcher:
    [
      "/dashboard/:path*",
      "/payment/:path*",
      "/receipt/:path*",
      "/login",
    ],
};