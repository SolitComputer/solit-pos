import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/services/supabaseAdmin";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { generateInvoice } from "@/lib/invoice";
import { sendWhatsapp, buildPaymentMessage } from "@/service/whatsapp";
import { logActivity } from "@/lib/activityLogger";
import { recordOutflow } from "@/lib/accessoryOutflow";
import { ACCESSORY_ONLY_SALES_ROLES, UserRole } from "@/lib/permissions";

function toNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return value;
    const num = parseFloat(String(value).trim().replace(",", "."));
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

        // ─────────────────────────────────────────────────────────────────────
        // 1. Normalisasi LAPTOP units (aksesori dipisah — lihat step 2)
        // ─────────────────────────────────────────────────────────────────────
        let laptopUnits: Array<{
            unit_id: string; laptop_id: string; laptop_name: string;
            serial_number: string; grade?: string | null;
            cost_price?: number; selling_price?: number;
        }> = [];

        if (Array.isArray(body.units) && body.units.length > 0) {
            laptopUnits = body.units
                .filter((u: any) => (u.unit_type ?? "laptop") === "laptop")
                .map((u: any) => ({
                    unit_id: u.unit_id,
                    laptop_id: u.laptop_id,
                    laptop_name: u.laptop_name,
                    serial_number: u.serial_number,
                    grade: u.grade ?? null,
                    cost_price: toNumber(u.purchase_price || u.cost_price || u.selling_price || 0),
                    selling_price: toNumber(u.selling_price || 0),
                }));
        } else if (body.unit_id) {
            const { data: unit, error: unitError } = await supabase
                .from("laptop_units")
                .select(`*, laptop:laptops ( id, laptop_name, brand, cpu, ram, storage, gpu, display, qty, selling_price )`)
                .eq("id", body.unit_id)
                .single();
            if (unitError || !unit)
                return NextResponse.json({ success: false, message: "Unit tidak ditemukan" }, { status: 404 });
            if (unit.status !== "SIAP_JUAL")
                return NextResponse.json({ success: false, message: `Unit tidak tersedia (status: ${unit.status})` }, { status: 400 });

            laptopUnits = [{
                unit_id: unit.id, laptop_id: unit.laptop.id, laptop_name: unit.laptop.laptop_name,
                serial_number: unit.serial_number, grade: unit.grade,
                cost_price: toNumber(unit.purchase_price),
                selling_price: Number(unit.selling_price) || 0,
            }];
        }

        // ─────────────────────────────────────────────────────────────────────
        // 2. Aksesori quantity-based (bonus = harga 0)
        // ─────────────────────────────────────────────────────────────────────
        type AccInput = { accessory_id: string; name: string; quantity: number; unit_price: number; is_bonus: boolean };
        const accessoriesInput: AccInput[] = Array.isArray(body.accessories)
            ? body.accessories
                .filter((a: any) => a?.accessory_id && Number(a.quantity) > 0)
                .map((a: any) => ({
                    accessory_id: String(a.accessory_id),
                    name: String(a.name ?? "Aksesori"),
                    quantity: Math.max(1, Math.trunc(Number(a.quantity) || 1)),
                    unit_price: a.is_bonus ? 0 : toNumber(a.unit_price),
                    is_bonus: Boolean(a.is_bonus),
                }))
            : [];

        // ── Mode pembayaran: DIRECT (lunas langsung) vs PENDING (DP/Ambil Dulu) ──
        // Ecommerce tetap pakai flag is_ecommerce lama (selalu PACKING, terpisah dari DP/Ambil Dulu).
        const isEcommerceEarly = Boolean(body.is_ecommerce);
        const isPendingDp = body.payment_mode === "PENDING" && !isEcommerceEarly;
        const dpAmountInput = isPendingDp ? Math.max(0, Math.round(Number(body.dp_amount) || 0)) : 0;
        const isAmbilDulu = isPendingDp && dpAmountInput === 0;
        const isDP = isPendingDp && dpAmountInput > 0;

        // ── Role Customer Service hanya boleh transaksi aksesoris (tanpa laptop) ──
        if (ACCESSORY_ONLY_SALES_ROLES.includes(user.role as UserRole) && laptopUnits.length > 0) {
            return NextResponse.json({
                success: false,
                message: "Customer Service hanya bisa membuat transaksi aksesoris (tanpa unit laptop).",
            }, { status: 403 });
        }

        // Minimal 1 item (laptop ATAU aksesori)
        if (laptopUnits.length === 0 && accessoriesInput.length === 0)
            return NextResponse.json({ success: false, message: "Minimal 1 unit atau aksesori harus dipilih" }, { status: 400 });

        const laptopUnitIds = laptopUnits.map(u => u.unit_id);

        // 3. Validasi harga modal laptop
        const invalidLaptopUnits = laptopUnits.filter(u => !u.cost_price || u.cost_price <= 0);
        if (invalidLaptopUnits.length > 0) {
            const sns = invalidLaptopUnits.map(u => u.serial_number).join(", ");
            return NextResponse.json({
                success: false,
                message: `❌ HARGA MODAL kosong/nol! Unit: ${sns}. Set harga modal di Laptops → Units dulu.`,
            }, { status: 400 });
        }

        // 4a. Validasi ketersediaan laptop
        if (laptopUnitIds.length > 0) {
            const { data: checks, error: e } = await supabase
                .from("laptop_units").select("id, serial_number, status").in("id", laptopUnitIds);
            if (e) throw e;
            const notAvailable = (checks ?? []).filter(u => u.status !== "SIAP_JUAL");
            if (notAvailable.length > 0)
                return NextResponse.json({ success: false, message: `Unit laptop tidak tersedia: ${notAvailable.map(u => u.serial_number).join(", ")}` }, { status: 409 });
        }

        // 4b. Validasi ketersediaan + ambil data aksesori (buy_price, stok)
        const accMap = new Map<string, { id: string; name: string; buy_price: number; sell_price: number; stock: number }>();
        const accQtyById = new Map<string, number>();
        if (accessoriesInput.length > 0) {
            const accIds = [...new Set(accessoriesInput.map(a => a.accessory_id))];
            const { data: accRows, error: accErr } = await supabase
                .from("accessories").select("id, name, buy_price, sell_price, stock").in("id", accIds);
            if (accErr) throw accErr;
            for (const r of accRows ?? [])
                accMap.set(r.id, { id: r.id, name: r.name, buy_price: Number(r.buy_price) || 0, sell_price: Number(r.sell_price) || 0, stock: Number(r.stock) || 0 });

            for (const a of accessoriesInput)
                accQtyById.set(a.accessory_id, (accQtyById.get(a.accessory_id) ?? 0) + a.quantity);

            for (const [accId, needQty] of accQtyById) {
                const row = accMap.get(accId);
                if (!row) return NextResponse.json({ success: false, message: `Aksesori tidak ditemukan (${accId})` }, { status: 404 });
                if (row.stock < needQty)
                    return NextResponse.json({ success: false, message: `Stok aksesori "${row.name}" kurang (tersedia ${row.stock}, diminta ${needQty})` }, { status: 409 });
            }
        }

        const invoice_number = await generateInvoice();
        const deal_price = Number(body.amount) || 0;

        if (isDP && dpAmountInput >= deal_price) {
            return NextResponse.json({
                success: false,
                message: "Nominal DP harus lebih kecil dari harga deal. Kalau bayar penuh, gunakan Payment Transaksi (langsung lunas), bukan DP.",
            }, { status: 400 });
        }

        // deal price per laptop unit
        const unitPriceMap = new Map<string, number>();
        if (Array.isArray(body.unit_prices))
            for (const p of body.unit_prices)
                if (p?.unit_id) unitPriceMap.set(String(p.unit_id), toNumber(p.deal_price));
        const perUnitFallback = laptopUnits.length > 0 ? Math.round(deal_price / laptopUnits.length) : 0;

        // inventory = modal laptop + modal aksesori
        const laptopInventory = laptopUnits.reduce((s, u) => s + (u.cost_price ?? 0), 0);
        const accessoryInventory = accessoriesInput.reduce((s, a) => s + (accMap.get(a.accessory_id)?.buy_price ?? 0) * a.quantity, 0);
        const inventory_price = laptopInventory + accessoryInventory;

        const payment_method = body.payment_method || "CASH";
        const is_trade_in = Boolean(body.is_trade_in);
        const trade_in_value = is_trade_in ? (Number(body.trade_in_value) || 0) : 0;
        const trade_in_cash = is_trade_in ? (Number(body.trade_in_cash) || 0) : 0;

        const isTfCash = payment_method === "TF_CASH";
        const amount_method_1 = isTfCash ? (Number(body.amount_method_1) || 0) : 0;
        const amount_method_2 = isTfCash ? (Number(body.amount_method_2) || 0) : 0;
        if (isTfCash && (amount_method_1 + amount_method_2) !== deal_price)
            return NextResponse.json({ success: false, message: `Total TF+Cash (${amount_method_1 + amount_method_2}) ≠ harga deal (${deal_price})` }, { status: 400 });

        const gross_profit = deal_price - inventory_price;
        const profitStatus = gross_profit > 0 ? "✓ PROFIT" : gross_profit < 0 ? "⚠️ LOSS" : "➖ BREAK EVEN";

        const isEcommerce = isEcommerceEarly;
        const txStatus = isEcommerce ? "PACKING" : isDP ? "RESERVED" : isAmbilDulu ? "HELD" : "PAID";
        // Status unit MENGIKUTI status transaksi selama masih pending (bukan cuma "RESERVED" generik).
        // Baru jadi SOLD ketika transaksi benar-benar lunas (dilakukan lewat FU / confirm-payment).
        const laptopUnitStatus = txStatus === "PAID" ? "SOLD" : txStatus; // "PACKING" | "RESERVED" | "HELD"

        // ── Display name & primary unit (handle aksesori-saja) ──
        const hasLaptops = laptopUnits.length > 0;
        const primaryUnit = hasLaptops ? laptopUnits[0] : null;
        const totalAccQty = accessoriesInput.reduce((s, a) => s + a.quantity, 0);

        let displayLaptopName: string;
        if (hasLaptops) {
            displayLaptopName = laptopUnits.length > 1
                ? `${primaryUnit!.laptop_name} (+${laptopUnits.length - 1} unit)`
                : primaryUnit!.laptop_name;
            if (accessoriesInput.length > 0) displayLaptopName += ` + ${totalAccQty} aksesori`;
        } else {
            displayLaptopName = accessoriesInput.length === 1
                ? `${accessoriesInput[0].name} x${accessoriesInput[0].quantity}`
                : `${accessoriesInput[0].name} (+${accessoriesInput.length - 1} item)`;
        }
        const displaySN = laptopUnits.map(u => u.serial_number).join(", ") || "-";

        // 5. Insert transaction
        const { data: transaction, error: txError } = await supabase
            .from("transactions").insert({
                invoice_number,
                sales_id: user.id, sales_name: user.name, employee_role: user.role,
                customer_name: body.customer_name,
                customer_type: body.customer_type || "UMUM",
                seller_type: body.seller_type === "PEDAGANG" ? "PEDAGANG" : "USER",
                company_name: body.company_name,
                customer_phone: body.customer_phone,

                laptop_id: hasLaptops ? primaryUnit!.laptop_id : null,
                unit_id: hasLaptops ? primaryUnit!.unit_id : null,
                laptop_name: displayLaptopName,
                serial_number: displaySN,
                unit_ids: laptopUnitIds.length > 0 ? laptopUnitIds : null,
                serial_numbers: laptopUnits.map(u => u.serial_number),

                deal_price, amount: deal_price, inventory_price, other: gross_profit,
                dp_amount: isDP ? dpAmountInput : 0,

                payment_method,
                payment_method_2: isTfCash ? (body.payment_method_2 || "CASH") : null,
                amount_method_1, amount_method_2,

                is_trade_in,
                trade_in_item: is_trade_in ? (body.trade_in_item || null) : null,
                trade_in_value, trade_in_cash,

                software_request: body.software_request,
                pickup_method: body.pickup_method, pickup_date: body.pickup_date,
                pickup_time: body.pickup_time, pickup_location: body.pickup_location,
                source_platform: body.source_platform, notes: body.notes,
                payment_photo: body.payment_photo, latitude: body.latitude, longitude: body.longitude,

                is_ecommerce: isEcommerce,
                ecommerce_platform: body.ecommerce_platform || null,
                ecommerce_order_id: body.ecommerce_order_id || null,

                customer_birth_date: body.customer_birth_date || null,
                status: txStatus,
                paid_at: txStatus === "PAID" ? new Date().toISOString() : null,
                item_kind: hasLaptops && accessoriesInput.length > 0
                    ? "mixed"
                    : hasLaptops
                        ? "laptop"
                        : "accessory",
            })
            .select().single();
        if (txError) throw txError;

        // 6. transaction_items (laptop + aksesori)
        const laptopItems = laptopUnits.map(u => ({
            transaction_id: transaction.id, invoice_number,
            item_type: "laptop",
            unit_id: u.unit_id, accessory_id: null, laptop_id: u.laptop_id,
            serial_number: u.serial_number, laptop_name: u.laptop_name, item_name: u.laptop_name,
            quantity: 1, is_bonus: false,
            selling_price: u.cost_price ?? 0,
            deal_price: unitPriceMap.get(u.unit_id) || perUnitFallback,
            grade: u.grade ?? null,
        }));

        const accessoryItems = accessoriesInput.map(a => ({
            transaction_id: transaction.id, invoice_number,
            item_type: "accessory",
            unit_id: null, accessory_id: a.accessory_id, laptop_id: null,
            serial_number: null, laptop_name: a.name, item_name: a.name,
            quantity: a.quantity, is_bonus: a.is_bonus,
            selling_price: accMap.get(a.accessory_id)?.buy_price ?? 0, // modal
            deal_price: a.unit_price * a.quantity,                     // 0 kalau bonus
            grade: null,
        }));

        const { error: itemsError } = await supabase
            .from("transaction_items").insert([...laptopItems, ...accessoryItems]);
        if (itemsError) console.error("[transaction_items]", itemsError.message);

        // 6b. Catat DP awal — supaya otomatis ke-pickup sync cashflow (kalau 0 / Ambil Dulu, TIDAK dicatat)
        if (isDP && dpAmountInput > 0) {
            const { error: dpPayErr } = await supabase.from("transaction_payments").insert({
                transaction_id: transaction.id,
                invoice_number,
                amount: dpAmountInput,
                payment_type: "DP",
                payment_method,
                created_by_name: user.name,
            });
            if (dpPayErr) console.error("[transaction/create] gagal catat DP:", dpPayErr.message);
        }

        // 7. Update status laptop_units
        if (laptopUnitIds.length > 0) {
            await supabase.from("laptop_units").update({
                status: laptopUnitStatus,
                reserved_by: laptopUnitStatus === "RESERVED" ? body.customer_name : null,
                reserved_invoice: laptopUnitStatus === "RESERVED" ? invoice_number : null,
            }).in("id", laptopUnitIds);
        }

        // 7b. Kurangi stok aksesori (atomik). Bonus & PACKING tetap dikurangi (barang keluar/dialokasikan).
        for (const [accId, qty] of accQtyById) {
            const { error: decErr } = await supabase.rpc("decrement_accessory_stock", { p_accessory_id: accId, p_qty: qty });
            if (decErr) console.error("[decrement_accessory_stock]", accId, decErr.message);

            await recordOutflow({
                accessory_id: accId,
                qty: qty,
                source_type: "transaction",
                transaction_invoice: invoice_number,
                notes: `Penjualan ${invoice_number}`,
                taken_by_role: "SALES",
                created_by: user.id
            });
        }

        // 8. Update qty laptop parent
        if (laptopUnitIds.length > 0) {
            const uniqueLaptopIds = [...new Set(laptopUnits.map(u => u.laptop_id))];
            await Promise.all(uniqueLaptopIds.map(async (lid) => {
                const { data: remaining } = await supabase
                    .from("laptop_units").select("id").eq("laptop_id", lid).eq("status", "SIAP_JUAL");
                const newQty = remaining?.length ?? 0;
                await supabase.from("laptops").update({
                    qty: newQty,
                    status: newQty <= 0 ? (isEcommerce ? "BELUM_SIAP" : "SOLD") : "SIAP_JUAL",
                }).eq("id", lid);
            }));
        }

        // 9. Warranty — hanya laptop, hanya kalau sudah benar-benar PAID (bukan DP/Ambil-Dulu/Ecommerce)
        if (txStatus === "PAID" && laptopUnits.length > 0) {
            const warrantyDuration = Number(body.warranty_duration) || 30;
            const wStart = new Date(); const wEnd = new Date();
            wEnd.setDate(wEnd.getDate() + warrantyDuration);
            const warranties = laptopUnits.map(u => ({
                invoice_number, serial_number: u.serial_number.toUpperCase(),
                customer_name: body.customer_name, customer_phone: body.customer_phone || null,
                laptop_name: u.laptop_name, laptop_id: u.laptop_id, unit_id: u.unit_id,
                warranty_start: wStart.toISOString().split("T")[0],
                warranty_end: wEnd.toISOString().split("T")[0],
                warranty_duration: warrantyDuration, status: "ACTIVE", created_by: user.name,
            }));
            const { error: wErr } = await supabase.from("warranties").insert(warranties);
            if (wErr) console.error("[warranty insert]", wErr.message);
        }

        // 10. Seller follow-up (tetap seperti sebelumnya)
        if (body.customer_phone) {
            const sellerType = body.seller_type === "PEDAGANG" ? "PEDAGANG" : "USER";
            const nowISO = new Date().toISOString();
            const nextISO = nextFollowupISO(sellerType);
            try {
                const { data: existing } = await supabase
                    .from("seller_followups").select("id, purchase_count")
                    .eq("customer_phone", body.customer_phone).maybeSingle();
                if (existing) {
                    await supabase.from("seller_followups").update({
                        transaction_id: transaction.id, invoice_number,
                        customer_name: body.customer_name, seller_type: sellerType,
                        last_purchase_at: nowISO, next_followup_at: nextISO,
                        purchase_count: (existing.purchase_count ?? 1) + 1,
                        closed_by: user.name, is_active: true, updated_at: nowISO,
                    }).eq("id", existing.id);
                } else {
                    await supabase.from("seller_followups").insert({
                        transaction_id: transaction.id, invoice_number,
                        customer_name: body.customer_name, customer_phone: body.customer_phone,
                        seller_type: sellerType, last_purchase_at: nowISO, next_followup_at: nextISO,
                        purchase_count: 1, closed_by: user.name, is_active: true,
                    });
                }
            } catch (e: any) { console.error("[seller_followup]", e?.message ?? e); }
        }

        // 11. Activity log
        await logActivity({
            userId: user.id, userName: user.name, userRole: user.role,
            action: "CREATE", entity: "transaction", entityId: transaction.id,
            entityLabel: `${invoice_number} — ${body.customer_name} (${laptopUnits.length} unit, ${totalAccQty} aksesori) [${txStatus}]${isEcommerce ? ` via ${body.ecommerce_platform}` : ""} | ${profitStatus} Rp${Math.abs(gross_profit).toLocaleString("id-ID")}`,
            afterData: transaction,
        });

        // 12. WhatsApp (non-blocking) — tetap
        if (body.customer_phone) {
            const message = buildPaymentMessage({
                customer_name: body.customer_name, invoice_number,
                laptop_name: displayLaptopName, serial_number: displaySN,
                amount: deal_price, payment_method,
                pickup_method: body.pickup_method, pickup_date: body.pickup_date,
                pickup_time: body.pickup_time, pickup_location: body.pickup_location,
                software_request: body.software_request, customer_type: body.customer_type,
            });
            const waTimeout = new Promise<boolean>((r) => setTimeout(() => r(false), 15_000));
            try { await Promise.race([sendWhatsapp(body.customer_phone, message), waTimeout]); }
            catch (e: any) { console.error("[WA]", e?.message ?? e); }
        }

        const pendingLabel = isDP
            ? `DP diterima Rp${dpAmountInput.toLocaleString("id-ID")}, sisa Rp${(deal_price - dpAmountInput).toLocaleString("id-ID")}`
            : isAmbilDulu
                ? "Status: Ambil Dulu (belum bayar)"
                : isEcommerce
                    ? "Status: Packing (menunggu dana cair)"
                    : `${profitStatus} Rp${Math.abs(gross_profit).toLocaleString("id-ID")}`;

        return NextResponse.json({
            success: true, data: transaction, invoice_number,
            message: `✓ Transaksi berhasil (${laptopUnits.length} unit, ${totalAccQty} aksesori) | ${pendingLabel}`,
        });
    } catch (err: any) {
        console.error("[transaction/create]", err);
        const message = err?.message ?? "Unknown error";
        return NextResponse.json({ success: false, message }, { status: 500 });
    }
}

export const POST = withAuth(handler, PERMISSIONS.CREATE_TRANSACTION);