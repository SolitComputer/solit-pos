import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { generateInvoice } from "@/lib/invoice";
import { sendWhatsapp, buildPaymentMessage } from "@/service/whatsapp";

async function handler(req: NextRequest, ctx: { params: any }, user: AuthUser) {
    try {
        const body = await req.json();

        const invoice_number = generateInvoice();

        // GET LAPTOP
        const { data: laptop, error: laptopError } = await supabase
            .from("laptops")
            .select("*")
            .eq("id", body.laptop_id)
            .single();

        if (laptopError || !laptop) {
            return NextResponse.json({ success: false, message: "Laptop tidak ditemukan" }, { status: 404 });
        }

        if (laptop.qty <= 0) {
            return NextResponse.json({ success: false, message: "Stock laptop habis" }, { status: 400 });
        }

        const inventory_price = Number(laptop.selling_price) || 0;
        const deal_price = Number(body.amount) || 0;

        // SAVE TRANSACTION
        const { data, error } = await supabase
            .from("transactions")
            .insert({
                invoice_number,
                sales_id: user.id,
                sales_name: user.name,
                laptop_id: body.laptop_id,
                customer_name: body.customer_name,
                company_name: body.company_name,
                customer_phone: body.customer_phone,
                laptop_name: laptop.laptop_name,
                serial_number: laptop.serial_number,
                software_request: body.software_request,
                pickup_method: body.pickup_method,
                pickup_date: body.pickup_date,
                pickup_time: body.pickup_time,
                pickup_location: body.pickup_location,
                source_platform: body.source_platform,
                inventory_price,
                deal_price,
                other: deal_price - inventory_price,
                amount: deal_price,
                payment_method: body.payment_method,
                payment_photo: body.payment_photo,
                latitude: body.latitude,
                longitude: body.longitude,
                notes: body.notes,
                status: "PAID",
                paid_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (error) {
            console.error(error);
            return NextResponse.json({ success: false, message: error.message }, { status: 400 });
        }

        // UPDATE STOCK
        const newQty = laptop.qty - 1;
        await supabase
            .from("laptops")
            .update({
                qty: newQty,
                status: newQty <= 0 ? "SOLD" : "SIAP_JUAL"
            })
            .eq("id", body.laptop_id);

        // ==========================
        // KIRIM WHATSAPP
        // ==========================
        if (body.customer_phone) {
            const message = buildPaymentMessage({
                customer_name: body.customer_name,
                invoice_number,
                laptop_name: laptop.laptop_name,
                serial_number: laptop.serial_number,
                amount: deal_price,
                payment_method: body.payment_method,
                pickup_method: body.pickup_method,
                pickup_date: body.pickup_date,
                pickup_time: body.pickup_time,
                pickup_location: body.pickup_location,
                software_request: body.software_request,
            });

            console.log("📱 [Production] Mulai kirim WA ke:", body.customer_phone);

            sendWhatsapp(body.customer_phone, message)
                .then(sent => {
                    if (sent) {
                        console.log("✅ [Production] WhatsApp BERHASIL terkirim");
                    } else {
                        console.warn("⚠️ [Production] WhatsApp GAGAL terkirim");
                    }
                })
                .catch(err => {
                    console.error("❌ [Production] Error kirim WA:", err);
                });
        }

        return NextResponse.json({ success: true, data, invoice_number });
    } catch (error) {
        console.error("Error handler:", error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
}

export const POST = withAuth(handler);