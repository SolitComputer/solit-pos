import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { generateInvoice } from "@/lib/invoice";
import { sendWhatsapp, buildPaymentMessage } from "@/service/whatsapp";
import { logActivity } from "@/lib/activityLogger";

async function handler(req: NextRequest, ctx: { params: any }, user: AuthUser) {
    try {
        const body = await req.json();

        // ─────────────────────────────────────────────────────────────────────────
        // 1. Normalisasi units
        //    Mode A (baru):  body.units = [{ unit_id, laptop_id, cost_price, ... }]
        //    Mode B (lama):  body.unit_id  ← dari scan barcode
        // ─────────────────────────────────────────────────────────────────────────
        let units: Array<{
            unit_id: string;
            laptop_id: string;
            laptop_name: string;
            serial_number: string;
            grade?: string;
            cost_price?: number;  // ✅ RENAMED: selling_price → cost_price (JELAS!)
            selling_price?: number; // Optional: harga jual default (info saja, tidak untuk kalkulasi profit)
        }> = [];

        if (Array.isArray(body.units) && body.units.length > 0) {
            // Mode A — multi-unit dari CreatePaymentClient baru
            // PENTING: Pastikan client kirim cost_price (bukan selling_price)!
            units = body.units.map((u: any) => ({
                unit_id: u.unit_id,
                laptop_id: u.laptop_id,
                laptop_name: u.laptop_name,
                serial_number: u.serial_number,
                grade: u.grade,
                // ✅ PRIORITAS: cost_price, fallback ke selling_price (for backward compat)
                cost_price: Number(u.cost_price || u.purchase_price || 0),
                selling_price: Number(u.selling_price || 0),
            }));
        } else if (body.unit_id) {
            // Mode B — legacy single unit, fetch dari DB
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
                    { success: false, message: `Unit tidak tersedia (status: ${unit.status})` },
                    { status: 400 }
                );
            }

            units = [{
                unit_id: unit.id,
                laptop_id: unit.laptop.id,
                laptop_name: unit.laptop.laptop_name,
                serial_number: unit.serial_number,
                grade: unit.grade,
                cost_price: Number(unit.purchase_price) || 0,  // ✅ CLEAR: ini harga modal dari unit
                selling_price: Number(unit.selling_price) || 0, // FYI: harga jual default
            }];
        } else {
            return NextResponse.json(
                { success: false, message: "Minimal 1 unit harus dipilih" },
                { status: 400 }
            );
        }

        // ─────────────────────────────────────────────────────────────────────────
        // 2. ✅ VALIDASI BARU: cost_price harus > 0!
        // ─────────────────────────────────────────────────────────────────────────
        const invalidUnits = units.filter(u => !u.cost_price || u.cost_price <= 0);
        if (invalidUnits.length > 0) {
            const sns = invalidUnits.map(u => u.serial_number).join(", ");
            return NextResponse.json(
                {
                    success: false,
                    message: `❌ HARGA MODAL tidak boleh kosong/nol! Unit: ${sns}. Silakan set harga modal di Laptops → Units terlebih dahulu.`
                },
                { status: 400 }
            );
        }

        // ─────────────────────────────────────────────────────────────────────────
        // 3. Validasi semua unit masih SIAP_JUAL
        // ─────────────────────────────────────────────────────────────────────────
        const unitIds = units.map(u => u.unit_id);

        const { data: unitChecks, error: unitCheckError } = await supabase
            .from("laptop_units")
            .select("id, serial_number, status")
            .in("id", unitIds);

        if (unitCheckError) throw unitCheckError;

        const notAvailable = (unitChecks ?? []).filter(u => u.status !== "SIAP_JUAL");
        if (notAvailable.length > 0) {
            const sns = notAvailable.map(u => u.serial_number).join(", ");
            return NextResponse.json(
                { success: false, message: `Unit tidak tersedia: ${sns}` },
                { status: 409 }
            );
        }

        const invoice_number = await generateInvoice();
        const deal_price = Number(body.amount) || 0;
        
        // ✅ JELAS: inventory_price = TOTAL COST PRICE (harga modal) dari semua unit
        const inventory_price = units.reduce((sum, u) => sum + (u.cost_price ?? 0), 0);
        
        const payment_method = body.payment_method || "CASH";

        // Trade-in
        const is_trade_in = Boolean(body.is_trade_in);
        const trade_in_value = is_trade_in ? (Number(body.trade_in_value) || 0) : 0;
        const trade_in_cash = is_trade_in ? (Number(body.trade_in_cash) || 0) : 0;

        const isTfCash = payment_method === "TF_CASH";
        const amount_method_1 = isTfCash ? (Number(body.amount_method_1) || 0) : 0;
        const amount_method_2 = isTfCash ? (Number(body.amount_method_2) || 0) : 0;

        if (isTfCash && (amount_method_1 + amount_method_2) !== deal_price) {
            return NextResponse.json(
                {
                    success: false,
                    message: `Total TF+Cash (${amount_method_1 + amount_method_2}) tidak sama dengan harga deal (${deal_price})`
                },
                { status: 400 }
            );
        }

        // ─────────────────────────────────────────────────────────────────────────
        // 4. GROSS PROFIT CALCULATION (PENTING!)
        // ─────────────────────────────────────────────────────────────────────────
        // GROSS PROFIT = Deal Price - Total Cost Price (harga modal)
        // Contoh:
        // - Customer membeli 1 laptop seharga Rp 2.500.000 (deal_price)
        // - Harga modal (cost): Rp 1.200.000 (inventory_price)
        // - GROSS PROFIT = Rp 2.500.000 - Rp 1.200.000 = Rp 1.300.000 ✓
        // - Margin % = (1.300.000 / 2.500.000) * 100 = 52%
        //
        // Field "other" di transactions table = GROSS PROFIT (bukan "biaya lain")
        // ─────────────────────────────────────────────────────────────────────────
        const gross_profit = deal_price - inventory_price;

        // ✅ INFO UNTUK DEBUG/LOG
        const profitStatus = 
            gross_profit > 0 ? `✓ PROFIT` :
            gross_profit < 0 ? `⚠️ LOSS` :
            `➖ BREAK EVEN`;

        // ─────────────────────────────────────────────────────────────────────────
        // 5. Status transaksi & unit
        // ─────────────────────────────────────────────────────────────────────────
        const isEcommerce = Boolean(body.is_ecommerce);
        const txStatus = isEcommerce ? "PACKING" : "PAID";
        const unitStatus = isEcommerce ? "RESERVED" : "SOLD";

        // Display fields
        const primaryUnit = units[0];
        const displayLaptopName = units.length > 1
            ? `${primaryUnit.laptop_name} (+${units.length - 1} unit)`
            : primaryUnit.laptop_name;
        const displaySN = units.map(u => u.serial_number).join(", ");

        // ─────────────────────────────────────────────────────────────────────────
        // 6. Insert transaction
        // ─────────────────────────────────────────────────────────────────────────
        const { data: transaction, error: txError } = await supabase
            .from("transactions")
            .insert({
                invoice_number,
                sales_id: user.id,
                sales_name: user.name,
                employee_role: user.role,

                // Customer
                customer_name: body.customer_name,
                customer_type: body.customer_type || "UMUM",
                company_name: body.company_name,
                customer_phone: body.customer_phone,

                // Laptop — primary unit (backward compat)
                laptop_id: primaryUnit.laptop_id,
                unit_id: primaryUnit.unit_id,
                laptop_name: displayLaptopName,
                serial_number: displaySN,

                // Multi-unit arrays
                unit_ids: unitIds,
                serial_numbers: units.map(u => u.serial_number),

                // Harga
                deal_price,
                amount: deal_price,
                inventory_price,  // ✅ JELAS: ini adalah TOTAL COST PRICE (harga modal)
                // PENTING: "other" field = GROSS PROFIT (deal_price - inventory_price)
                other: gross_profit,

                // Metode bayar
                payment_method,
                payment_method_2: isTfCash ? (body.payment_method_2 || "CASH") : null,
                amount_method_1,
                amount_method_2,

                // Trade-in
                is_trade_in,
                trade_in_item: is_trade_in ? (body.trade_in_item || null) : null,
                trade_in_value,
                trade_in_cash,

                // Pickup
                software_request: body.software_request,
                pickup_method: body.pickup_method,
                pickup_date: body.pickup_date,
                pickup_time: body.pickup_time,
                pickup_location: body.pickup_location,
                source_platform: body.source_platform,
                notes: body.notes,

                // Foto & GPS
                payment_photo: body.payment_photo,
                latitude: body.latitude,
                longitude: body.longitude,

                // E-commerce
                is_ecommerce: isEcommerce,
                ecommerce_platform: body.ecommerce_platform || null,
                ecommerce_order_id: body.ecommerce_order_id || null,

                // Status
                status: txStatus,
                paid_at: isEcommerce ? null : new Date().toISOString(),
            })
            .select()
            .single();

        if (txError) throw txError;

        // ─────────────────────────────────────────────────────────────────────────
        // 7. Insert transaction_items (detail per unit, non-fatal)
        // ─────────────────────────────────────────────────────────────────────────
        const itemsToInsert = units.map(u => ({
            transaction_id: transaction.id,
            invoice_number,
            unit_id: u.unit_id,
            laptop_id: u.laptop_id,
            serial_number: u.serial_number,
            laptop_name: u.laptop_name,
            selling_price: u.cost_price ?? 0,  // ✅ Jelas: ini adalah cost price per unit
            deal_price: Math.round(deal_price / units.length),
            grade: u.grade ?? null,
        }));

        const { error: itemsError } = await supabase
            .from("transaction_items")
            .insert(itemsToInsert);

        if (itemsError) {
            console.error("[transaction_items]", itemsError.message);
        }

        // ─────────────────────────────────────────────────────────────────────────
        // 8. Update status semua unit
        // ─────────────────────────────────────────────────────────────────────────
        await supabase
            .from("laptop_units")
            .update({
                status: unitStatus,
                reserved_by: unitStatus === "RESERVED" ? body.customer_name : null,
                reserved_invoice: unitStatus === "RESERVED" ? invoice_number : null,
            })
            .in("id", unitIds);

        // ─────────────────────────────────────────────────────────────────────────
        // 9. Update qty tiap laptop yang terlibat
        // ─────────────────────────────────────────────────────────────────────────
        const uniqueLaptopIds = [...new Set(units.map(u => u.laptop_id))];

        await Promise.all(uniqueLaptopIds.map(async (lid) => {
            const { data: remaining } = await supabase
                .from("laptop_units")
                .select("id")
                .eq("laptop_id", lid)
                .eq("status", "SIAP_JUAL");

            const newQty = remaining?.length ?? 0;
            await supabase
                .from("laptops")
                .update({
                    qty: newQty,
                    status: newQty <= 0
                        ? (isEcommerce ? "BELUM_SIAP" : "SOLD")
                        : "SIAP_JUAL",
                })
                .eq("id", lid);
        }));

        // ─────────────────────────────────────────────────────────────────────────
        // 10. Buat warranty per unit (hanya jika PAID, bukan PACKING)
        // ─────────────────────────────────────────────────────────────────────────
        if (!isEcommerce) {
            const warrantyDuration = Number(body.warranty_duration) || 30;
            const warrantyStart = new Date();
            const warrantyEnd = new Date();
            warrantyEnd.setDate(warrantyEnd.getDate() + warrantyDuration);

            const warrantiesToInsert = units.map(u => ({
                invoice_number,
                serial_number: u.serial_number.toUpperCase(),
                customer_name: body.customer_name,
                customer_phone: body.customer_phone || null,
                laptop_name: u.laptop_name,
                laptop_id: u.laptop_id,
                unit_id: u.unit_id,
                warranty_start: warrantyStart.toISOString().split("T")[0],
                warranty_end: warrantyEnd.toISOString().split("T")[0],
                warranty_duration: warrantyDuration,
                status: "ACTIVE",
                created_by: user.name,
            }));

            const { error: warrantyError } = await supabase
                .from("warranties")
                .insert(warrantiesToInsert);

            if (warrantyError) {
                console.error("[warranty insert]", warrantyError.message);
            }
        }

        // ─────────────────────────────────────────────────────────────────────────
        // 11. Activity log
        // ─────────────────────────────────────────────────────────────────────────
        await logActivity({
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            action: "CREATE",
            entity: "transaction",
            entityId: transaction.id,
            entityLabel: `${invoice_number} — ${body.customer_name} (${units.length} unit) [${txStatus}]${isEcommerce ? ` via ${body.ecommerce_platform}` : ""} | ${profitStatus} Rp${Math.abs(gross_profit).toLocaleString("id-ID")}`,
            afterData: transaction,
        });

        // ─────────────────────────────────────────────────────────────────────────
        // 12. Kirim WhatsApp (non-blocking, fire & forget)
        // ─────────────────────────────────────────────────────────────────────────
        if (body.customer_phone) {
            const message = buildPaymentMessage({
                customer_name: body.customer_name,
                invoice_number,
                laptop_name: displayLaptopName,
                serial_number: displaySN,
                amount: deal_price,
                payment_method,
                pickup_method: body.pickup_method,
                pickup_date: body.pickup_date,
                pickup_time: body.pickup_time,
                pickup_location: body.pickup_location,
                software_request: body.software_request,
                customer_type: body.customer_type,
            });

            sendWhatsapp(body.customer_phone, message)
                .then(sent => console.log(sent ? "✅ WA BERHASIL" : "⚠️ WA GAGAL"))
                .catch(err => console.error("❌ WA Error:", err));
        }

        return NextResponse.json({
            success: true,
            data: transaction,
            invoice_number,
            message: `✓ Transaksi berhasil (${units.length} unit) | ${profitStatus} Rp${Math.abs(gross_profit).toLocaleString("id-ID")}`,
        });

    } catch (err: any) {
        console.error("[transaction/create]", err);
        const message = err?.message ?? err?.error_description ?? JSON.stringify(err) ?? "Unknown error";
        return NextResponse.json(
            { success: false, message },
            { status: 500 }
        );
    }
}

export const POST = withAuth(handler, PERMISSIONS.CREATE_TRANSACTION);