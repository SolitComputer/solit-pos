import { NextResponse }
from "next/server";

import { supabase }
from "@/services/supabase";

export async function GET() {
  try {

    // HARI INI
    const today =
      new Date();

    today.setHours(
      0,
      0,
      0,
      0
    );

    const todayISO =
      today.toISOString();

    // TRANSAKSI PAID
    const {
      data:
        paidTransactions,
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
          "created_at",
          todayISO
        );

    // TRANSAKSI PENDING
    const {
      count:
        pendingCount,
    } =
      await supabase
        .from(
          "transactions"
        )
        .select("*", {
          count:
            "exact",
          head:
            true,
        })
        .eq(
          "status",
          "PENDING"
        );

    // STOCK READY
    const {
      count:
        stockReady,
    } =
      await supabase
        .from(
          "laptops"
        )
        .select("*", {
          count:
            "exact",
          head:
            true,
        })
        .gt(
          "qty",
          0
        );

    const totalRevenue =
      paidTransactions?.reduce(
        (
          acc,
          item
        ) =>
          acc +
          item.amount,
        0
      ) || 0;

    const totalSold =
      paidTransactions?.length ||
      0;

    return NextResponse.json({
      success: true,

      data: {
        totalRevenue,

        totalSold,

        pendingCount:
          pendingCount ||
          0,

        stockReady:
          stockReady ||
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