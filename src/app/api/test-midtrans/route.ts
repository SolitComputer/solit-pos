import { NextResponse } from "next/server";

import { snap } from "@/services/midtrans";

export async function GET() {
  try {
    const transaction =
      await snap.createTransaction({
        transaction_details: {
          order_id:
            "TEST-" +
            Date.now(),

          gross_amount:
            10000,
        },

        enabled_payments: [
          "qris",
        ],
      } as any);

    return NextResponse.json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: String(error),
      },
      { status: 500 }
    );
  }
}