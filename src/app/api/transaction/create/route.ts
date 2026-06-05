import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { generateInvoice } from "@/lib/invoice";
import { sendWhatsapp, buildPaymentMessage } from "@/service/whatsapp";
import { logActivity } from "@/lib/activityLogger";

async function handler(req: NextRequest, ctx: { params: any }, user: AuthUser) {
    try {
        const body = await req.json();

        if (!body.unit_id) {
            return NextResponse.json(
                { success: false, message: "unit_id wajib diisi" },
                { status: 400 }
            );
        }

        const invoice_number = await generateInvoice();

        const { data: unit, error: unitError } = await supabase
            .from("laptop_units")
            .select(`
                *,
                laptop:laptops (
                    id, laptop_name, brand, cpu, ram,
                    storage, gpu, display, qty, selling_price
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

        const inventory_price = Number(unit.purchase_price) || 0;
        const deal_price = Number(body.amount) || 0;

        // ✅ Tentukan status transaksi & unit berdasarkan e-commerce atau tidak
        const isEcommerce = Boolean(body.is_ecommerce);
        const txStatus = isEcommerce ? "PACKING" : "PAID";
        const unitStatus = isEcommerce ? "PACKING" : "SOLD";

        const { data, error } = await supabase
            .from("transactions")
            .insert({
                invoice_number,
                sales_id: user.id,
                sales_name: user.name,
                laptop_id: laptop.id,
                unit_id: unit.id,
                customer_name: body.customer_name,
                customer_type: body.customer_type || "UMUM",
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
                other: deal_price - inventory_price,
                amount: deal_price,
                payment_method: body.payment_method,
                payment_photo: body.payment_photo,
                latitude: body.latitude,
                longitude: body.longitude,
                notes: body.notes,
                // ✅ Field e-commerce
                is_ecommerce: isEcommerce,
                ecommerce_platform: body.ecommerce_platform || null,
                ecommerce_order_id: body.ecommerce_order_id || null,
                status: txStatus,
                // ✅ PACKING belum paid_at, PAID langsung set
                paid_at: isEcommerce ? null : new Date().toISOString(),
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

        // ✅ Update status unit — PACKING = RESERVED, PAID = SOLD
        await supabase
            .from("laptop_units")
            .update({
                status: unitStatus,
                ...(isEcommerce && {
                    reserved_by: body.customer_name,
                    reserved_invoice: invoice_number,
                }),
            })
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
                status: newQty <= 0 ? (isEcommerce ? "BELUM_SIAP" : "SOLD") : "SIAP_JUAL",
            })
            .eq("id", laptop.id);

        if (!isEcommerce) {
            const warrantyDuration = Number(body.warranty_duration) || 30;
            const warrantyStart = new Date();
            const warrantyEnd = new Date();
            warrantyEnd.setDate(warrantyEnd.getDate() + warrantyDuration);

            await supabase.from("warranties").insert({
                invoice_number,
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
        }

        await logActivity({
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            action: "CREATE",
            entity: "transaction",
            entityId: data.id,
            entityLabel: `${invoice_number} — ${body.customer_name} [${txStatus}]${isEcommerce ? ` via ${body.ecommerce_platform}` : ""}`,
            afterData: data,
        });

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

            sendWhatsapp(body.customer_phone, message)
                .then(sent => console.log(sent ? "✅ WA BERHASIL" : "⚠️ WA GAGAL"))
                .catch(err => console.error("❌ Error kirim WA:", err));
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