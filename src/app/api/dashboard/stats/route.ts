import { NextResponse }
from "next/server";

import { supabase }
from "@/services/supabase";

export async function GET() {

  try {

    const today =
      new Date();

    const startToday =
      new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      ).toISOString();

    // TRANSACTION TODAY
    const {
      data:
        todayTransactions,
    } =
      await supabase
        .from(
          "transactions"
        )
        .select("*")
        .eq(
          "status",
          "PAID"
        )
        .gte(
          "paid_at",
          startToday
        );

    // PENDING
    const {
      data:
        pendingTransactions,
    } =
      await supabase
        .from(
          "transactions"
        )
        .select("*")
        .eq(
          "status",
          "PENDING"
        );

    // READY LAPTOP
    const {
      data:
        laptops,
    } =
      await supabase
        .from(
          "laptops"
        )
        .select("*")
        .eq(
          "status",
          "SIAP_JUAL"
        )
        .gt(
          "qty",
          0
        );

    const todayRevenue =
      todayTransactions?.reduce(
        (
          acc,
          item
        ) =>
          acc +
          item.amount,
        0
      ) || 0;

    return NextResponse.json({
      success:
        true,

      data: {
        todayRevenue,

        todayTransactions:
          todayTransactions?.length ||
          0,

        laptopReady:
          laptops?.length ||
          0,

        pendingPayments:
          pendingTransactions?.length ||
          0,
      },
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