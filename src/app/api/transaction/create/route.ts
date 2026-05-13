import { NextResponse } from "next/server";

import { supabase } from "@/services/supabase";
import { generateInvoice } from "@/lib/invoice";
import { snap } from "@/services/midtrans";

export async function POST(
    request: Request
) {
    try {
        const body =
            await request.json();

        const invoice_number =
            generateInvoice();

        // CREATE MIDTRANS TRANSACTION
        const midtransTransaction =
            await snap.createTransaction({
                transaction_details: {
                    order_id:
                        invoice_number,

                    gross_amount:
                        body.amount,
                },

                customer_details: {
                    first_name:
                        body.customer_name,

                    phone:
                        body.customer_phone,
                },
            } as any);

        console.log(
            "MIDTRANS:",
            midtransTransaction
        );

        // SAVE TO DATABASE
        const { data, error } =
            await supabase
                .from("transactions")
                .insert({
                    invoice_number,

                    customer_name:
                        body.customer_name,

                    customer_phone:
                        body.customer_phone,

                    laptop_name:
                        body.laptop_name,

                    amount:
                        body.amount,

                    payment_method:
                        body.payment_method,

                    notes:
                        body.notes,

                    payment_token:
                        midtransTransaction.token,

                    payment_url:
                        midtransTransaction.redirect_url,

                    status:
                        "PENDING",
                })
                .select()
                .single();

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
        console.error(error);

        return NextResponse.json(
            {
                success: false,
                message:
                    String(error),
            },
            { status: 500 }
        );
    }
}