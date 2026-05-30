// C:\solit-pos\src\app\api\transaction\create\route.ts
//
// PERUBAHAN dari versi lama:
// - Sekarang menerima unit_id (bukan hanya laptop_id)
// - SN diambil dari laptop_units bukan dari laptops
// - Setelah transaksi, update status unit jadi SOLD
// - Update qty laptop otomatis via sync logika

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { generateInvoice } from "@/lib/invoice";
import { sendWhatsapp, buildPaymentMessage } from "@/service/whatsapp";

async function handler(req: NextRequest, ctx: { params: any }, user: AuthUser) {
    try {
        const body = await req.json();

        // ── Validasi unit_id wajib ada ─────────────────────────────────────
        if (!body.unit_id) {
            return NextResponse.json(
                { success: false, message: "unit_id wajib diisi" },
                { status: 400 }
            );
        }

        const invoice_number = generateInvoice();

        // ── GET UNIT (laptop_units) ────────────────────────────────────────
        // Unit = satu item spesifik dengan SN unik
        const { data: unit, error: unitError } = await supabase
            .from("laptop_units")
            .select(`
                *,
                laptop:laptops (
                    id,
                    laptop_name,
                    brand,
                    cpu,
                    ram,
                    storage,
                    gpu,
                    display,
                    qty,
                    selling_price
                )
            `)
            .eq("id", body.unit_id)
            .single();

        if (unitError || !unit) {
            return NextResponse.json(
                { success: false, message: "Unit tidak ditemukan" },
                { status: 404 }
            );
        }

        if (unit.status !== "SIAP_JUAL") {
            return NextResponse.json(
                { success: false, message: `Unit ini tidak tersedia untuk dijual (status: ${unit.status})` },
                { status: 400 }
            );
        }

        const laptop = unit.laptop;
        if (!laptop) {
            return NextResponse.json(
                { success: false, message: "Data laptop tidak ditemukan" },
                { status: 404 }
            );
        }

        // Harga: gunakan selling_price dari unit (lebih spesifik),
        // fallback ke laptop.selling_price
        const inventory_price = Number(unit.selling_price) || Number(laptop.selling_price) || 0;
        const deal_price = Number(body.amount) || 0;

        // ── SAVE TRANSACTION ──────────────────────────────────────────────
        const { data, error } = await supabase
            .from("transactions")
            .insert({
                invoice_number,
                sales_id: user.id,
                sales_name: user.name,
                laptop_id: laptop.id,
                customer_name: body.customer_name,
                company_name: body.company_name,
                customer_phone: body.customer_phone,
                laptop_name: laptop.laptop_name,
                serial_number: unit.serial_number,
                software_request: body.software_request,
                pickup_method: body.pickup_method,
                pickup_date: body.pickup_date,
                pickup_time: body.pickup_time,
                pickup_location: body.pickup_location,
                source_platform: body.source_platform,
                inventory_price,
                deal_price,
                other: Number(deal_price) - Number(inventory_price),
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

        await supabase
            .from("laptop_units")
            .update({ status: "SOLD" })
            .eq("id", unit.id);

        const { data: remainingUnits } = await supabase
            .from("laptop_units")
            .select("id")
            .eq("laptop_id", laptop.id)
            .eq("status", "SIAP_JUAL");

        const newQty = remainingUnits?.length ?? 0;
        await supabase
            .from("laptops")
            .update({
                qty: newQty,
                status: newQty <= 0 ? "SOLD" : "SIAP_JUAL",
            })
            .eq("id", laptop.id);

        const warrantyDuration = Number(body.warranty_duration) || 30;
        const warrantyStart = new Date();
        const warrantyEnd = new Date();
        warrantyEnd.setDate(warrantyEnd.getDate() + warrantyDuration);

        await supabase.from("warranties").insert({
            invoice_number: invoice_number,
            serial_number: unit.serial_number.toUpperCase(),
            customer_name: body.customer_name,
            customer_phone: body.customer_phone || null,
            laptop_name: laptop.laptop_name,
            laptop_id: laptop.id,
            unit_id: unit.id,
            warranty_start: warrantyStart.toISOString().split("T")[0],
            warranty_end: warrantyEnd.toISOString().split("T")[0],
            warranty_duration: warrantyDuration,
            status: "ACTIVE",
            created_by: user.name,  
        });

        // ── KIRIM WHATSAPP ────────────────────────────────────────────────
        if (body.customer_phone) {
            const message = buildPaymentMessage({
                customer_name: body.customer_name,
                invoice_number,
                laptop_name: laptop.laptop_name,
                serial_number: unit.serial_number,
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
                    console.log(sent ? "✅ WA BERHASIL" : "⚠️ WA GAGAL");
                })
                .catch(err => {
                    console.error("❌ Error kirim WA:", err);
                });
        }

        return NextResponse.json({ success: true, data, invoice_number });

    } catch (error) {
        console.error("Error handler:", error);
        return NextResponse.json(
            { success: false, message: String(error) },
            { status: 500 }
        );
    }
}

export const POST = withAuth(handler, PERMISSIONS.CREATE_TRANSACTION);