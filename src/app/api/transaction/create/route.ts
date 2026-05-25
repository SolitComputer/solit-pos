import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { generateInvoice } from "@/lib/invoice";
import { sendWhatsapp } from "@/service/whatsapp";

async function handler(req: NextRequest, ctx: { params: any }, user: AuthUser) {
    try {
        const body = await req.json();

        const invoice_number = generateInvoice();

        // ==========================
        // GET LAPTOP
        // ==========================
        const { data: laptop, error: laptopError } = await supabase
            .from("laptops")
            .select("*")
            .eq("id", body.laptop_id)
            .single();

        if (laptopError || !laptop) {
            return NextResponse.json(
                { success: false, message: "Laptop tidak ditemukan" },
                { status: 404 }
            );
        }

        // ==========================
        // VALIDASI STOCK
        // ==========================
        if (laptop.qty <= 0) {
            return NextResponse.json(
                { success: false, message: "Stock laptop habis" },
                { status: 400 }
            );
        }

        // ==========================
        // PRICE LOGIC
        // ==========================
        const inventory_price = Number(laptop.selling_price) || 0;
        const deal_price = Number(body.amount) || 0;
        const other = deal_price - inventory_price;

        // ==========================
        // SAVE TRANSACTION
        // ==========================
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
                other,
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
            return NextResponse.json(
                { success: false, message: error.message },
                { status: 400 }
            );
        }

        // ==========================
        // UPDATE STOCK
        // ==========================
        const newQty = laptop.qty - 1;
        const newStatus = newQty <= 0 ? "SOLD" : "SIAP_JUAL";

        const { error: updateError } = await supabase
            .from("laptops")
            .update({ qty: newQty, status: newStatus })
            .eq("id", body.laptop_id);

        if (updateError) {
            console.error("UPDATE STOCK ERROR:", updateError);
        }

        // ==========================
        // KIRIM WHATSAPP OTOMATIS
        // ==========================
        if (body.customer_phone) {
            const pickupInfo = body.pickup_method === "DIANTAR"
                ? `📍 Alamat: ${body.pickup_location || "-"}`
                : `🏪 Datang ke toko`;

            const pickupDate = body.pickup_date
                ? new Date(body.pickup_date).toLocaleDateString("id-ID", {
                    weekday: "long", day: "numeric", month: "long", year: "numeric",
                })
                : null;

            const message =
                `Halo *${body.customer_name}* 👋\n\n` +
                `✅ Pembayaran laptop Anda telah *berhasil dikonfirmasi!*\n\n` +
                `━━━━━━━━━━━━━━━\n` +
                `📋 *INVOICE: ${invoice_number}*\n` +
                `━━━━━━━━━━━━━━━\n\n` +
                `💻 *Laptop:* ${laptop.laptop_name}\n` +
                (laptop.serial_number ? `🔢 *SN:* ${laptop.serial_number}\n` : "") +
                (body.software_request ? `💿 *Software:* ${body.software_request}\n` : "") +
                `\n💰 *Total:* Rp${deal_price.toLocaleString("id-ID")}\n` +
                `💳 *Metode:* ${body.payment_method}\n` +
                `🏷️ *Status:* LUNAS\n\n` +
                `━━━━━━━━━━━━━━━\n` +
                `📦 *Info Pengambilan*\n` +
                `${pickupInfo}\n` +
                (pickupDate ? `📅 Tanggal: ${pickupDate}\n` : "") +
                (body.pickup_time ? `⏰ Jam: ${body.pickup_time}\n` : "") +
                `━━━━━━━━━━━━━━━\n\n` +
                `Terima kasih sudah berbelanja di *Solit 03* 🙏\n` +
                `_Sawangan, Depok_`;

            // Fire-and-forget: tidak block response meski WA gagal
            sendWhatsapp(body.customer_phone, message).catch((err) => {
                console.error("[WA] Error:", err);
            });
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error(error);
        return NextResponse.json(
            { success: false, message: String(error) },
            { status: 500 }
        );
    }
}

export const POST = withAuth(handler);