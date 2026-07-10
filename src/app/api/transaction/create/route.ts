import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { generateInvoice } from "@/lib/invoice";
import { sendWhatsapp, buildPaymentMessage } from "@/service/whatsapp";
import { logActivity } from "@/lib/activityLogger";

function toNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return value;
    const str = String(value).trim().replace(",", ".");
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
}

const SELLER_FOLLOWUP_DAYS: Record<string, number> = { USER: 7, PEDAGANG: 3 };
function nextFollowupISO(sellerType: string, from: Date = new Date()): string {
    const days = SELLER_FOLLOWUP_DAYS[sellerType] ?? 7;
    const next = new Date(from);
    next.setDate(next.getDate() + days);
    return next.toISOString();
}

async function handler(req: NextRequest, ctx: { params: any }, user: AuthUser) {
    try {
        const body = await req.json();

        // ─────────────────────────────────────────────────────────────────────────
        // 1. Normalisasi units
        //    Mode A (baru):  body.units = [{ unit_id, laptop_id, unit_type, ... }]
        //    Mode B (lama):  body.unit_id  ← dari scan barcode (selalu laptop)
        // ─────────────────────────────────────────────────────────────────────────
        let units: Array<{
            unit_id: string;
            laptop_id: string;
            laptop_name: string;
            serial_number: string;
            grade?: string | null;
            cost_price?: number;
            selling_price?: number;
            unit_type: "laptop" | "accessory";
        }> = [];

        if (Array.isArray(body.units) && body.units.length > 0) {
            units = body.units.map((u: any) => ({
                unit_id: u.unit_id,
                laptop_id: u.laptop_id,
                laptop_name: u.laptop_name,
                serial_number: u.serial_number,
                grade: u.grade ?? null,
                cost_price: toNumber(u.purchase_price || u.cost_price || u.selling_price || 0),
                selling_price: toNumber(u.selling_price || 0),
                unit_type: (u.unit_type === "accessory" ? "accessory" : "laptop") as "laptop" | "accessory",
            }));
        } else if (body.unit_id) {
            // Mode B — legacy single unit dari scan (pasti laptop)
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
                cost_price: toNumber(unit.purchase_price),
                selling_price: Number(unit.selling_price) || 0,
                unit_type: "laptop",
            }];
        } else {
            return NextResponse.json(
                { success: false, message: "Minimal 1 unit harus dipilih" },
                { status: 400 }
            );
        }

        // ─────────────────────────────────────────────────────────────────────────
        // 2. Pisahkan unit laptop vs aksesori
        // ─────────────────────────────────────────────────────────────────────────
        const laptopUnits = units.filter(u => u.unit_type === "laptop");
        const accessoryUnits = units.filter(u => u.unit_type === "accessory");

        const laptopUnitIds = laptopUnits.map(u => u.unit_id);
        const accessoryUnitIds = accessoryUnits.map(u => u.unit_id);

        // ─────────────────────────────────────────────────────────────────────────
        // 3. Validasi cost_price hanya untuk laptop (aksesori boleh 0)
        // ─────────────────────────────────────────────────────────────────────────
        const invalidLaptopUnits = laptopUnits.filter(u => !u.cost_price || u.cost_price <= 0);
        if (invalidLaptopUnits.length > 0) {
            const sns = invalidLaptopUnits.map(u => u.serial_number).join(", ");
            return NextResponse.json(
                {
                    success: false,
                    message: `❌ HARGA MODAL tidak boleh kosong/nol! Unit: ${sns}. Silakan set harga modal di Laptops → Units terlebih dahulu.`,
                },
                { status: 400 }
            );
        }

        // ─────────────────────────────────────────────────────────────────────────
        // 4. Validasi ketersediaan — laptop_units dan accessory_units terpisah
        // ─────────────────────────────────────────────────────────────────────────
        if (laptopUnitIds.length > 0) {
            const { data: laptopChecks, error: laptopCheckError } = await supabase
                .from("laptop_units")
                .select("id, serial_number, status")
                .in("id", laptopUnitIds);

            if (laptopCheckError) throw laptopCheckError;

            const notAvailable = (laptopChecks ?? []).filter(u => u.status !== "SIAP_JUAL");
            if (notAvailable.length > 0) {
                const sns = notAvailable.map(u => u.serial_number).join(", ");
                return NextResponse.json(
                    { success: false, message: `Unit laptop tidak tersedia: ${sns}` },
                    { status: 409 }
                );
            }
        }

        if (accessoryUnitIds.length > 0) {
            const { data: accChecks, error: accCheckError } = await supabase
                .from("accessory_units")
                .select("id, serial_number, status")
                .in("id", accessoryUnitIds);

            if (accCheckError) throw accCheckError;

            const notAvailable = (accChecks ?? []).filter(u => u.status !== "TERSEDIA");
            if (notAvailable.length > 0) {
                const sns = notAvailable.map(u => u.serial_number).join(", ");
                return NextResponse.json(
                    { success: false, message: `Unit aksesori tidak tersedia: ${sns}` },
                    { status: 409 }
                );
            }
        }

        const invoice_number = await generateInvoice();
        const deal_price = Number(body.amount) || 0;

        const unitPriceMap = new Map<string, number>();
        if (Array.isArray(body.unit_prices)) {
            for (const p of body.unit_prices) {
                if (p?.unit_id) unitPriceMap.set(String(p.unit_id), toNumber(p.deal_price));
            }
        }
        const perUnitFallback = Math.round(deal_price / units.length);
        const inventory_price = units.reduce((sum, u) => sum + (u.cost_price ?? 0), 0);
        const payment_method = body.payment_method || "CASH";

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
                    message: `Total TF+Cash (${amount_method_1 + amount_method_2}) tidak sama dengan harga deal (${deal_price})`,
                },
                { status: 400 }
            );
        }

        const gross_profit = deal_price - inventory_price;
        const profitStatus =
            gross_profit > 0 ? "✓ PROFIT" :
                gross_profit < 0 ? "⚠️ LOSS" :
                    "➖ BREAK EVEN";

        const isEcommerce = Boolean(body.is_ecommerce);
        const txStatus = isEcommerce ? "PACKING" : "PAID";

        // Status per tipe unit
        const laptopUnitStatus = isEcommerce ? "RESERVED" : "SOLD";
        const accessoryUnitStatus = isEcommerce ? "RESERVED" : "TERJUAL"; // ← BERBEDA: accessory_units pakai TERJUAL

        const primaryUnit = units[0];
        const displayLaptopName = units.length > 1
            ? `${primaryUnit.laptop_name} (+${units.length - 1} unit)`
            : primaryUnit.laptop_name;
        const displaySN = units.map(u => u.serial_number).join(", ");

        const allUnitIds = units.map(u => u.unit_id);

        // ─────────────────────────────────────────────────────────────────────────
        // 5. Insert transaction
        //    unit_id FK ke laptop_units — set null kalau primary unit adalah aksesori
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
                seller_type: body.seller_type === "PEDAGANG" ? "PEDAGANG" : "USER",
                company_name: body.company_name,
                customer_phone: body.customer_phone,

                // Primary unit — unit_id nullable kalau aksesori (hindari FK violation)
                laptop_id: primaryUnit.unit_type === "laptop" ? primaryUnit.laptop_id : null,
                unit_id: primaryUnit.unit_type === "laptop" ? primaryUnit.unit_id : null,
                laptop_name: displayLaptopName,
                serial_number: displaySN,

                // Multi-unit arrays — simpan semua ID tapi di kolom terpisah per tipe
                unit_ids: laptopUnitIds.length > 0 ? laptopUnitIds : null,
                serial_numbers: units.map(u => u.serial_number),

                // Harga
                deal_price,
                amount: deal_price,
                inventory_price,
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
                customer_birth_date: body.customer_birth_date || null,
                status: txStatus,
                paid_at: isEcommerce ? null : new Date().toISOString(),
            })
            .select()
            .single();

        if (txError) throw txError;

        // ─────────────────────────────────────────────────────────────────────────
        // 6. Insert transaction_items per unit
        //    unit_id nullable kalau aksesori, ada accessory_unit_id untuk aksesori
        // ─────────────────────────────────────────────────────────────────────────
        const itemsToInsert = units.map(u => ({
            transaction_id: transaction.id,
            invoice_number,
            unit_id: u.unit_type === "laptop" ? u.unit_id : null,
            accessory_unit_id: u.unit_type === "accessory" ? u.unit_id : null,
            laptop_id: u.unit_type === "laptop" ? u.laptop_id : null,
            serial_number: u.serial_number,
            laptop_name: u.laptop_name,
            selling_price: u.cost_price ?? 0,
            deal_price: unitPriceMap.get(u.unit_id) || perUnitFallback,
            grade: u.grade ?? null,
        }));

        const { error: itemsError } = await supabase
            .from("transaction_items")
            .insert(itemsToInsert);

        if (itemsError) {
            console.error("[transaction_items]", itemsError.message);
        }

        // ─────────────────────────────────────────────────────────────────────────
        // 7. Update status — laptop_units dan accessory_units terpisah
        // ─────────────────────────────────────────────────────────────────────────
        if (laptopUnitIds.length > 0) {
            await supabase
                .from("laptop_units")
                .update({
                    status: laptopUnitStatus,
                    reserved_by: laptopUnitStatus === "RESERVED" ? body.customer_name : null,
                    reserved_invoice: laptopUnitStatus === "RESERVED" ? invoice_number : null,
                })
                .in("id", laptopUnitIds);
        }

        if (accessoryUnitIds.length > 0) {
            await supabase
                .from("accessory_units")
                .update({ status: accessoryUnitStatus })
                .in("id", accessoryUnitIds);
        }

        // ─────────────────────────────────────────────────────────────────────────
        // 8. Update qty tiap laptop (hanya untuk laptop units, skip aksesori)
        // ─────────────────────────────────────────────────────────────────────────
        if (laptopUnitIds.length > 0) {
            const uniqueLaptopIds = [...new Set(laptopUnits.map(u => u.laptop_id))];

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
        }

        // ─────────────────────────────────────────────────────────────────────────
        // 9. Buat warranty per unit (hanya PAID, bukan PACKING)
        //    Untuk aksesori: unit_id null, pakai accessory_unit_id
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
                laptop_id: u.unit_type === "laptop" ? u.laptop_id : null,
                unit_id: u.unit_type === "laptop" ? u.unit_id : null,
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

        // ── Upsert seller follow-up (Management Seller) ──────────────────────────
        // Hanya kalau ada nomor HP (follow-up butuh kontak). Dedup by customer_phone:
        // kalau customer beli lagi, timer-nya di-refresh & purchase_count nambah.
        if (body.customer_phone) {
            const sellerType = body.seller_type === "PEDAGANG" ? "PEDAGANG" : "USER";
            const nowISO = new Date().toISOString();
            const nextISO = nextFollowupISO(sellerType);

            try {
                const { data: existing } = await supabase
                    .from("seller_followups")
                    .select("id, purchase_count")
                    .eq("customer_phone", body.customer_phone)
                    .maybeSingle();

                if (existing) {
                    await supabase
                        .from("seller_followups")
                        .update({
                            transaction_id: transaction.id,
                            invoice_number,
                            customer_name: body.customer_name,
                            seller_type: sellerType,
                            last_purchase_at: nowISO,
                            next_followup_at: nextISO,
                            purchase_count: (existing.purchase_count ?? 1) + 1,
                            is_active: true,
                            updated_at: nowISO,
                        })
                        .eq("id", existing.id);
                } else {
                    await supabase.from("seller_followups").insert({
                        transaction_id: transaction.id,
                        invoice_number,
                        customer_name: body.customer_name,
                        customer_phone: body.customer_phone,
                        seller_type: sellerType,
                        last_purchase_at: nowISO,
                        next_followup_at: nextISO,
                        purchase_count: 1,
                        is_active: true,
                    });
                }
            } catch (followupErr: any) {
                console.error("[seller_followup upsert]", followupErr?.message ?? followupErr);
            }
        }

        // ─────────────────────────────────────────────────────────────────────────
        // 10. Activity log
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
        // 11. Kirim WhatsApp (non-blocking)
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

            const waTimeout = new Promise<boolean>((resolve) =>
                setTimeout(() => {
                    console.warn("[WA] Timeout 15s — lanjut tanpa WA");
                    resolve(false);
                }, 15_000)
            );

            try {
                const waSent = await Promise.race([
                    sendWhatsapp(body.customer_phone, message),
                    waTimeout,
                ]);
                console.log(`[WA] ${waSent ? "✅ Terkirim" : "⚠️ Gagal/Timeout"} → ${body.customer_phone} | Invoice: ${invoice_number}`);
            } catch (waErr: any) {
                console.error("[WA] Error:", waErr?.message ?? waErr);
            }
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