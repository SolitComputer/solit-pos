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

  // PUBLIC ROUTES
  const publicRoutes =
    [
      "/login",
      "/api/auth/login",
      "/receipt",
      "/payment",
      "/api/webhook",
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

  // BELUM LOGIN
  if (
    !token &&
    !isPublic
  ) {
    return NextResponse.redirect(
      new URL(
        "/login",
        request.url
      )
    );
  }

  // SUDAH LOGIN
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

      // SALES BLOCK
      if (
        user.role ===
          "SALES" &&
        pathname.startsWith(
          "/dashboard"
        )
      ) {
        return NextResponse.redirect(
          new URL(
            "/payment/create",
            request.url
          )
        );
      }

      // ADMIN BLOCK LOGIN
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

    } catch {

      return NextResponse.redirect(
        new URL(
          "/login",
          request.url
        )
      );
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
        "/login",
      ],
  };