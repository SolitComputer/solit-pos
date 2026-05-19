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
        // TODAY TRANSACTION
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
        // REVENUE
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

        // =====================
        // PROFIT
        // =====================
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

        // =====================
        // STOCK
        // =====================
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

        // =====================
        // TOP SALES
        // =====================
        const salesMap:
            Record<
                string,
                {
                    total:
                    number;

                    profit:
                    number;
                }
            > = {};

        todayTransactions?.forEach(
            (
                item
            ) => {

                const sales =
                    item.sales_name ||
                    "Unknown";

                if (
                    !salesMap[
                    sales
                    ]
                ) {
                    salesMap[
                        sales
                    ] = {
                        total:
                            0,

                        profit:
                            0,
                    };
                }

                salesMap[
                    sales
                ].total += 1;

                salesMap[
                    sales
                ].profit +=
                    item.other ||
                    0;
            }
        );

        const topSales =
            Object.entries(
                salesMap
            )
                .map(
                    (
                        [
                            name,
                            data,
                        ]
                    ) => ({
                        name,
                        total:
                            data.total,
                        profit:
                            data.profit,
                    })
                )
                .sort(
                    (
                        a,
                        b
                    ) =>
                        b.total -
                        a.total
                )
                .slice(
                    0,
                    5
                );

        // =====================
        // TOP SOURCE
        // =====================
        const sourceMap:
            Record<
                string,
                number
            > = {};

        todayTransactions?.forEach(
            (
                item
            ) => {

                const source =
                    item.source_platform ||
                    "Unknown";

                sourceMap[
                    source
                ] =
                    (
                        sourceMap[
                        source
                        ] ||
                        0
                    ) + 1;
            }
        );

        const topSources =
            Object.entries(
                sourceMap
            )
                .map(
                    (
                        [
                            name,
                            total,
                        ]
                    ) => ({
                        name,
                        total,
                    })
                )
                .sort(
                    (
                        a,
                        b
                    ) =>
                        b.total -
                        a.total
                )
                .slice(
                    0,
                    5
                );

        // =====================
        // TOP LAPTOP
        // =====================
        const laptopMap:
            Record<
                string,
                number
            > = {};

        todayTransactions?.forEach(
            (
                item
            ) => {

                const laptop =
                    item.laptop_name ||
                    "Unknown";

                laptopMap[
                    laptop
                ] =
                    (
                        laptopMap[
                        laptop
                        ] ||
                        0
                    ) + 1;
            }
        );

        const topLaptop =
            Object.entries(
                laptopMap
            )
                .map(
                    (
                        [
                            name,
                            total,
                        ]
                    ) => ({
                        name,
                        total,
                    })
                )
                .sort(
                    (
                        a,
                        b
                    ) =>
                        b.total -
                        a.total
                )
                .slice(
                    0,
                    5
                );

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

                topSales,

                topSources,

                topLaptop,
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