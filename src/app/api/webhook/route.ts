import { NextResponse }
from "next/server";

import { supabase }
from "@/services/supabase";

import { sendWhatsapp }
from "@/service/whatsapp";

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

    // CHECK TRANSACTION
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

      (
        transactionStatus ===
          "capture" &&
        fraudStatus ===
          "accept"
      );

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
            laptop.qty - 1;

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
                newQty <= 0
                  ? "SOLD"
                  : laptop.status,

              ready_to_sell:
                newQty > 0,
            })
            .eq(
              "id",
              laptop.id
            );
        }
      }

      // AUTO SEND WA
      if (
        transaction?.customer_phone
      ) {

        const phone =
          transaction.customer_phone
            .replace(
              /^0/,
              "62"
            );

        await sendWhatsapp(
          phone,
`Halo ${transaction.customer_name} 👋

Pembayaran Anda telah berhasil dan dinyatakan *LUNAS* ✅

🧾 Invoice:
${transaction.invoice_number}

💻 Laptop:
${transaction.laptop_name}

💰 Total:
Rp${transaction.amount.toLocaleString("id-ID")}

Silakan simpan invoice berikut:
${process.env.NEXT_PUBLIC_APP_URL}/receipt/${transaction.invoice_number}

Terima kasih telah berbelanja di Solit 03 🙏`
        );

        console.log(
          "WA SUCCESS"
        );
      }
    }

    return NextResponse.json({
      success: true,
    });

  } catch (error) {

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