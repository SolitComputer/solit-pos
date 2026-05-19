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

        // =====================
        // TRANSACTION TODAY
        // =====================
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

        // =====================
        // READY LAPTOP
        // =====================
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

        // =====================
        // CALCULATION
        // =====================
        const todayRevenue =
            todayTransactions?.reduce(
                (
                    acc,
                    item
                ) =>
                    acc +
                    (
                        item.amount ||
                        0
                    ),
                0
            ) || 0;

        const todayProfit =
            todayTransactions?.reduce(
                (
                    acc,
                    item
                ) =>
                    acc +
                    (
                        item.other ||
                        0
                    ),
                0
            ) || 0;

        const stockTotal =
            laptops?.reduce(
                (
                    acc,
                    item
                ) =>
                    acc +
                    (
                        item.qty ||
                        0
                    ),
                0
            ) || 0;

        return NextResponse.json({
            success:
                true,

            data: {

                todayRevenue,

                todayProfit,

                todayTransactions:
                    todayTransactions?.length ||
                    0,

                laptopReady:
                    laptops?.length ||
                    0,

                stockTotal,
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