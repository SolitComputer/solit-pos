import {
    NextResponse,
} from "next/server";

import type {
    NextRequest,
} from "next/server";

export function middleware(
    request: NextRequest
) {

    const token =
        request.cookies.get(
            "token"
        )?.value;

    const pathname =
        request.nextUrl.pathname;

    console.log(
        "PATH:",
        pathname
    );

    console.log(
        "TOKEN:",
        !!token
    );

    // ====================
    // PUBLIC ROUTES
    // ====================
    const publicRoutes = [
        "/login",
        "/api/auth/login",
    ];

    const isPublic =
        publicRoutes.includes(
            pathname
        );

    // ====================
    // PUBLIC RECEIPT
    // ====================
    const isReceipt =
        pathname.startsWith(
            "/receipt/"
        );

    // ====================
    // BELUM LOGIN
    // ====================
    if (
        !token &&
        !isPublic &&
        !isReceipt
    ) {
        return NextResponse.redirect(
            new URL(
                "/login",
                request.url
            )
        );
    }

    // ====================
    // SUDAH LOGIN
    // ====================
    if (
        token &&
        pathname ===
        "/login"
    ) {
        return NextResponse.redirect(
            new URL(
                "/dashboard",
                request.url
            )
        );
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/dashboard/:path*",
        "/payment/:path*",
        "/receipt/:path*",
        "/login",
    ],
};