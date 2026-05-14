import crypto from "crypto";
import { NextResponse } from "next/server";

import { supabase } from "@/services/supabase";

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

    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
    } = body;

    const serverKey =
      process.env
        .MIDTRANS_SERVER_KEY!;

    const hashed =
      crypto
        .createHash("sha512")
        .update(
          order_id +
            status_code +
            gross_amount +
            serverKey
        )
        .digest("hex");

    console.log(
      "HASHED:",
      hashed
    );

    console.log(
      "SIGNATURE:",
      signature_key
    );

    // VERIFY
    if (
      hashed !==
      signature_key
    ) {
      console.log(
        "INVALID SIGNATURE"
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid signature",
        },
        { status: 401 }
      );
    }

    console.log(
      "STATUS:",
      transaction_status
    );

    if (
      transaction_status ===
        "settlement" ||
      transaction_status ===
        "capture"
    ) {
      const { error } =
        await supabase
          .from(
            "transactions"
          )
          .update({
            status:
              "PAID",

            paid_at:
              new Date().toISOString(),
          })
          .eq(
            "invoice_number",
            order_id
          );

      console.log(
        "UPDATE ERROR:",
        error
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
      },
      { status: 500 }
    );
  }
}