import { cookies }
from "next/headers";

import jwt
from "jsonwebtoken";

import { NextResponse }
from "next/server";

export async function GET() {

  try {

    const cookieStore =
      await cookies();

    const token =
      cookieStore.get(
        "token"
      )?.value;

    if (!token) {
      return NextResponse.json(
        {
          success:
            false,
        },
        {
          status:
            401,
        }
      );
    }

    const user =
      jwt.verify(
        token,
        process.env
          .JWT_SECRET ||
          "secret"
      );

    return NextResponse.json({
      success:
        true,

      user,
    });

  } catch {
    return NextResponse.json(
      {
        success:
          false,
      },
      {
        status:
          401,
      }
    );
  }
}