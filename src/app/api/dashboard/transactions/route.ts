import { NextResponse }
  from "next/server";

import { supabase }
  from "@/services/supabase";

export async function GET() {

  try {

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "transactions"
        )
        .select("*")
        .order(
          "created_at",
          {
            ascending:
              false,
          }
        )
        .limit(10);

    if (error) {

      return NextResponse.json(
        {
          success:
            false,

          message:
            error.message,
        },
        {
          status:
            400,
        }
      );
    }

    return NextResponse.json({
      success:
        true,

      data:
        data || [],
    });

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