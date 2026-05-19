import {
    NextResponse,
} from "next/server";

import type {
    NextRequest,
} from "next/server";

import {
    jwtVerify
}
from "jose";

export async function middleware(
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
    // VERIFY JWT
    // ====================
    let user:
        any =
        null;

    if (token) {

        try {

            const jwtSecret =
                process.env
                    .JWT_SECRET ||
                "secret";

            console.log(
                "JWT SECRET EXISTS:",
                !!jwtSecret
            );

            const secret =
                new TextEncoder()
                    .encode(
                        jwtSecret
                    );

            const {
                payload,
            } =
                await jwtVerify(
                    token,
                    secret
                );

            user =
                payload;

            console.log(
                "USER:",
                user
            );

        } catch (
            error
        ) {

            console.log(
                "JWT ERROR:",
                error
            );

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

    // ====================
    // LOGIN REDIRECT
    // ====================
    if (
        token &&
        pathname ===
        "/login"
    ) {

        return NextResponse.redirect(
            new URL(
                user?.role ===
                    "ADMIN"
                    ? "/dashboard"
                    : "/payment/create",
                request.url
            )
        );
    }

    // ====================
    // SALES ACCESS
    // ====================
    if (
        user?.role ===
        "SALES"
    ) {

        const salesAllowed =
            [
                "/payment/create",
                "/dashboard/transactions",
                "/receipt/",
            ];

        const canAccess =
            salesAllowed.some(
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