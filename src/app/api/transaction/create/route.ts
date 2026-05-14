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

                callbacks: {
                    finish:
                        `${process.env.NEXT_PUBLIC_APP_URL}/receipt/${invoice_number}`,

                    pending:
                        `${process.env.NEXT_PUBLIC_APP_URL}/payment/${invoice_number}`,

                    error:
                        `${process.env.NEXT_PUBLIC_APP_URL}/payment/${invoice_number}`,
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

                    laptop_id:
                        body.laptop_id,

                    customer_name:
                        body.customer_name,

                    company_name:
                        body.company_name,

                    customer_phone:
                        body.customer_phone,

                    laptop_name:
                        body.laptop_name,

                    serial_number:
                        body.serial_number,

                    software_request:
                        body.software_request,

                    pickup_method:
                        body.pickup_method,

                    pickup_date:
                        body.pickup_date,

                    pickup_time:
                        body.pickup_time,

                    pickup_location:
                        body.pickup_location,

                    source_platform:
                        body.source_platform,

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