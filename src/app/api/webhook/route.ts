import { NextResponse }
from "next/server";

import { supabase }
from "@/services/supabase";

export async function POST(
  request: Request
) {
  try {
    const body =
      await request.json();

    console.log(
      "WEBHOOK:",
      body
    );

    const orderId =
      body.order_id;

    const transactionStatus =
      body.transaction_status;

    const fraudStatus =
      body.fraud_status;

    // CHECK TRANSACTION DULU
    const {
      data:
        existingTransaction,
    } =
      await supabase
        .from(
          "transactions"
        )
        .select("*")
        .eq(
          "invoice_number",
          orderId
        )
        .single();

    // SUDAH PAID?
    if (
      existingTransaction?.status ===
      "PAID"
    ) {
      console.log(
        "TRANSACTION ALREADY PAID"
      );

      return NextResponse.json({
        success: true,
        message:
          "Already processed",
      });
    }

    // PAYMENT SUCCESS
    const isPaid =
      transactionStatus ===
        "settlement" ||
      (transactionStatus ===
        "capture" &&
        fraudStatus ===
          "accept");

    if (isPaid) {
      console.log(
        "PAYMENT SUCCESS"
      );

      // UPDATE TRANSACTION
      const {
        data:
          transaction,
        error:
          transactionError,
      } =
        await supabase
          .from(
            "transactions"
          )
          .update({
            status:
              "PAID",

            paid_at:
              new Date()
                .toISOString(),
          })
          .eq(
            "invoice_number",
            orderId
          )
          .select()
          .single();

      if (
        transactionError
      ) {
        console.log(
          transactionError
        );
      }

      // UPDATE STOCK
      if (
        transaction?.laptop_id
      ) {
        const {
          data:
            laptop,
        } =
          await supabase
            .from(
              "laptops"
            )
            .select("*")
            .eq(
              "id",
              transaction.laptop_id
            )
            .single();

        if (
          laptop
        ) {
          const newQty =
            laptop.qty -
            1;

          await supabase
            .from(
              "laptops"
            )
            .update({
              qty:
                Math.max(
                  0,
                  newQty
                ),

              status:
                newQty <=
                0
                  ? "SOLD"
                  : laptop.status,

              ready_to_sell:
                newQty >
                0,
            })
            .eq(
              "id",
              laptop.id
            );
        }
      }
    }

    return NextResponse.json({
      success: true,
    });
  } catch (
    error
  ) {
    console.error(
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