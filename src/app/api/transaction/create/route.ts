import { NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { generateInvoice } from "@/lib/invoice";

export async function POST(
    request: Request
) {
    try {

        const body =
            await request.json();

        const invoice_number =
            generateInvoice();

        // ==========================
        // GET LAPTOP
        // ==========================
        const {
            data: laptop,
            error: laptopError,
        } = await supabase
            .from("laptops")
            .select("*")
            .eq(
                "id",
                body.laptop_id
            )
            .single();

        if (
            laptopError ||
            !laptop
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Laptop tidak ditemukan",
                },
                { status: 404 }
            );
        }

        // ==========================
        // VALIDASI STOCK
        // ==========================
        if (
            laptop.qty <= 0
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Stock laptop habis",
                },
                { status: 400 }
            );
        }

        // ==========================
        // PRICE LOGIC
        // ==========================
        const inventory_price =
            Number(
                laptop.selling_price
            ) || 0;

        const deal_price =
            Number(
                body.amount
            ) || 0;

        const other =
            deal_price -
            inventory_price;

        // ==========================
        // SAVE TRANSACTION
        // ==========================
        const {
            data,
            error,
        } = await supabase
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
                    laptop.laptop_name,

                serial_number:
                    laptop.serial_number,

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

                // PRICE
                inventory_price,
                deal_price,
                other,

                amount:
                    deal_price,

                payment_method:
                    body.payment_method,

                payment_photo:
                    body.payment_photo,

                latitude:
                    body.latitude,

                longitude:
                    body.longitude,

                notes:
                    body.notes,

                status:
                    "PAID",

                paid_at:
                    new Date()
                        .toISOString(),
            })
            .select()
            .single();

        if (error) {

            console.error(
                error
            );

            return NextResponse.json(
                {
                    success: false,
                    message:
                        error.message,
                },
                { status: 400 }
            );
        }

        // ==========================
        // UPDATE STOCK
        // ==========================
        const newQty =
            laptop.qty - 1;

        const newStatus =
            newQty <= 0
                ? "SOLD"
                : "SIAP_JUAL";

        const {
            error:
            updateError,
        } =
            await supabase
                .from("laptops")
                .update({
                    qty:
                        newQty,

                    status:
                        newStatus,
                })
                .eq(
                    "id",
                    body.laptop_id
                );

        if (
            updateError
        ) {
            console.error(
                "UPDATE STOCK ERROR:",
                updateError
            );
        }

        return NextResponse.json({
            success: true,
            data,
        });

    } catch (
    error
    ) {

        console.error(
            error
        );

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