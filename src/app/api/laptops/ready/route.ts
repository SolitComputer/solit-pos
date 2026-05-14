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
        .from("laptops")
        .select("*")
        .eq(
          "status",
          "SIAP_JUAL"
        )
        .gt(
          "qty",
          0
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          }
        );

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message:
            error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
      },
      { status: 500 }
    );
  }
}