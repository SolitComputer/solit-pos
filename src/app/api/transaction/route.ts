import { NextResponse }
from "next/server";

import { supabase }
from "@/services/supabase";

export async function GET(
  request: Request
) {
  try {

    const {
      searchParams,
    } =
      new URL(
        request.url
      );

    const search =
      searchParams.get(
        "search"
      ) || "";

    const status =
      searchParams.get(
        "status"
      ) || "ALL";

    let query =
      supabase
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
        );

    if (
      status !==
      "ALL"
    ) {
      query =
        query.eq(
          "status",
          status
        );
    }

    const {
      data,
      error,
    } =
      await query;

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

    const filtered =
      data?.filter(
        (item) => {

          const keyword =
            search.toLowerCase();

          return (
            item.customer_name
              ?.toLowerCase()
              ?.includes(
                keyword
              ) ||

            item.invoice_number
              ?.toLowerCase()
              ?.includes(
                keyword
              ) ||

            item.customer_phone
              ?.toLowerCase()
              ?.includes(
                keyword
              ) ||

            item.laptop_name
              ?.toLowerCase()
              ?.includes(
                keyword
              )
          );
        }
      ) || [];

    return NextResponse.json({
      success: true,
      data:
        filtered,
    });

  } catch {
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