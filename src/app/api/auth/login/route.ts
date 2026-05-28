import { NextResponse }
    from "next/server";

import bcrypt
    from "bcryptjs";

import jwt
    from "jsonwebtoken";

import { supabase }
    from "@/services/supabase";

export async function POST(
    request: Request
) {
    try {

        const body =
            await request.json();

        const {
            email,
            password,
        } = body;

        // ======================
        // CARI USER
        // ======================
        const {
            data: user,
            error,
        } = await supabase
            .from("users")
            .select("*")
            .eq(
                "email",
                email
            )
            .single();

        if (
            error ||
            !user
        ) {
            return NextResponse.json(
                {
                    success:
                        false,

                    message:
                        "Email tidak ditemukan",
                },
                {
                    status:
                        400,
                }
            );
        }

        // ======================
        // CHECK PASSWORD
        // ======================
        const isMatch =
            await bcrypt.compare(
                password,
                user.password
            );

        if (!isMatch) {
            return NextResponse.json(
                {
                    success:
                        false,

                    message:
                        "Password salah",
                },
                {
                    status:
                        400,
                }
            );
        }

        // ======================
        // GENERATE JWT
        // ======================
        const token =
            jwt.sign(
                {
                    id:
                        user.id,

                    name:
                        user.name,

                    role:
                        user.role,
                },

                process.env
                    .JWT_SECRET ||
                "secret",

                {
                    expiresIn:
                        "7d",
                }
            );

        console.log(
            "LOGIN SUCCESS:",
            user.role
        );

        // ======================
        // RESPONSE
        // ======================
        const redirect =
            user.role === "ADMIN"
                ? "/dashboard"
                : user.role === "OPERATOR"
                    ? "/dashboard/laptops"
                    : "/payment/create";

        const response = NextResponse.json(
            {
                success: true,
                redirect,
                user: {
                    name: user.name,
                    role: user.role,
                },
            },
            {
                status: 200,
            }
        );

        // ======================
        // SET COOKIE
        // ======================
        response.cookies.set(
            "token",
            token,
            {
                httpOnly:
                    true,

                secure:
                    process.env
                        .NODE_ENV ===
                    "production",

                sameSite:
                    "lax",

                path:
                    "/",

                maxAge:
                    60 *
                    60 *
                    24 *
                    7,
            }
        );

        return response;

    } catch (
    error
    ) {

        console.error(
            "LOGIN ERROR:",
            error
        );

        return NextResponse.json(
            {
                success:
                    false,

                message:
                    "Internal server error",
            },
            {
                status:
                    500,
            }
        );
    }
}