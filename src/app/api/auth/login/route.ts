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

        // CARI USER
        const {
            data: user,
            error,
        } =
            await supabase
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

        // CHECK PASSWORD
        const isMatch =
            await bcrypt.compare(
                password,
                user.password
            );

        if (
            !isMatch
        ) {
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

        // JWT TOKEN
        const token =
            jwt.sign(
                {
                    id:
                        user.id,

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

        const response =
            NextResponse.json({
                success:
                    true,

                user: {
                    name:
                        user.name,

                    role:
                        user.role,
                },
            });

        response.cookies.set(
            "token",
            token,
            {
                httpOnly: true,

                secure: false,

                sameSite: "lax",

                path: "/",

                maxAge:
                    60 *
                    60 *
                    24 *
                    7,
            }
        );

        console.log(
            "LOGIN SUCCESS:",
            user.role
        );

        return response;

    } catch (
    error
    ) {

        console.log(
            error
        );

        return NextResponse.json(
            {
                success:
                    false,
            },
            {
                status:
                    500,
            }
        );
    }
}