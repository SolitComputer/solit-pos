import { NextResponse }
from "next/server";

import { supabase }
from "@/services/supabase";

export async function GET() {
  try {
    const { data, error } =
      await supabase
        .from("laptops")
        .select("*")
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
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
      },
      { status: 500 }
    );
  }
}