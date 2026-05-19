import jwt
    from "jsonwebtoken";

import {
    cookies
}
    from "next/headers";

export async function
    getCurrentUser() {

    try {

        const cookieStore =
            await cookies();

        const token =
            cookieStore.get(
                "token"
            )?.value;

        console.log(
            "TOKEN:",
            token
        );

        if (
            !token
        ) {
            return null;
        }

        const user =
            jwt.verify(
                token,
                process.env
                    .JWT_SECRET ||
                "secret"
            ) as {
                id:
                string;

                name:
                string;

                role:
                string;
            };

        console.log(
            "USER:",
            user
        );

        return user;

    } catch (
    error
    ) {

        console.log(
            "AUTH ERROR:",
            error
        );

        return null;
    }
}