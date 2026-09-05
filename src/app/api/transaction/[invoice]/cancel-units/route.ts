import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/services/supabaseAdmin";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";

interface Props {
    params: Promise<{ invoice: string }>;
}

// Status yang boleh dikurangi unitnya — sama seperti RESTORABLE_STATUSES di
// restore/route.ts tapi TANPA "PAID" (transaksi yang sudah lunas penuh sudah
// keluar dari halaman Pending, partial cancel tidak berlaku di sana).
const PARTIAL_CANCEL_STATUSES = ["RESERVED", "HELD", "PACKING", "PENDING"] as const;

async function handler(req: NextRequest, props: Props, user: AuthUser) {
    try {
        const { invoice } = await props.params;
        const body = await req.json().catch(() => ({}));
        const reason = typeof body.reason === "string" ? body.reason.trim() : "";
        const unitIdsToCancel: string[] = Array.isArray(body.unit_ids)
            ? [...new Set(body.unit_ids.filter((id: any) => typeof id === "string" && id))]
            : [];

        if (!reason) {
            return NextResponse.json({ success: false, message: "Alasan wajib diisi" }, { status: 400 });
        }
        if (unitIdsToCancel.length === 0) {
            return NextResponse.json({ success: false, message: "Pilih minimal 1 unit yang tidak jadi" }, { status: 400 });
        }

        // 1. Ambil transaksi
        const { data: transaction, error: txError } = await supabase
            .from("transactions")
            .select("*")
            .eq("invoice_number", invoice)
            .single();

        if (txError || !transaction) {
            return NextResponse.json({ success: false, message: "Transaksi tidak ditemukan" }, { status: 404 });
        }

        if (!PARTIAL_CANCEL_STATUSES.includes(transaction.status as any)) {
            return NextResponse.json(
                { success: false, message: `Transaksi dengan status "${transaction.status}" tidak bisa dikurangi unitnya` },
                { status: 400 }
            );
        }

        // 2. Ambil SEMUA transaction_items laptop milik invoice ini (sumber kebenaran per-unit)
        const { data: allItems, error: itemsFetchError } = await supabase
            .from("transaction_items")
            .select("id, unit_id, laptop_id, serial_number, laptop_name, deal_price, selling_price")
            .eq("invoice_number", invoice)
            .eq("item_type", "laptop");

        if (itemsFetchError) {
            return NextResponse.json({ success: false, message: itemsFetchError.message }, { status: 400 });
        }

        const items = allItems ?? [];
        const itemsToCancel = items.filter((it) => unitIdsToCancel.includes(it.unit_id));
        const itemsRemaining = items.filter((it) => !unitIdsToCancel.includes(it.unit_id));

        if (itemsToCancel.length === 0) {
            return NextResponse.json({ success: false, message: "Unit yang dipilih tidak ditemukan di transaksi ini" }, { status: 400 });
        }
        if (itemsRemaining.length === 0) {
            return NextResponse.json(
                { success: false, message: "Semua unit dipilih — gunakan tombol Tidak Jadi biasa untuk membatalkan seluruh transaksi" },
                { status: 400 }
            );
        }

        // 3. Kembalikan unit yang dibatalkan ke SIAP_JUAL
        const cancelledUnitIds = itemsToCancel.map((it) => it.unit_id).filter(Boolean) as string[];

        const { data: unitsData } = await supabase
            .from("laptop_units")
            .select("id, laptop_id")
            .in("id", cancelledUnitIds);

        const affectedLaptopIds = new Set<string>();
        for (const unit of unitsData ?? []) {
            if (unit.laptop_id) affectedLaptopIds.add(unit.laptop_id);
        }

        const { error: unitErr } = await supabase
            .from("laptop_units")
            .update({ status: "SIAP_JUAL", reserved_by: null, reserved_invoice: null })
            .in("id", cancelledUnitIds);

        if (unitErr) {
            return NextResponse.json(
                { success: false, message: "Gagal mengembalikan status unit: " + unitErr.message },
                { status: 500 }
            );
        }

        // 4. Sync qty & status laptop parent (sama persis pola di restore/route.ts)
        for (const laptopId of affectedLaptopIds) {
            const { data: siapUnits } = await supabase
                .from("laptop_units")
                .select("id")
                .eq("laptop_id", laptopId)
                .eq("status", "SIAP_JUAL");

            const newQty = siapUnits?.length ?? 0;

            await supabase
                .from("laptops")
                .update({ qty: newQty, status: newQty > 0 ? "SIAP_JUAL" : "SOLD", ready_to_sell: newQty > 0 })
                .eq("id", laptopId);
        }

        // 5. Hapus baris transaction_items milik unit yang dibatalkan
        const cancelledItemIds = itemsToCancel.map((it) => it.id);
        const { error: deleteItemsErr } = await supabase
            .from("transaction_items")
            .delete()
            .in("id", cancelledItemIds);
        if (deleteItemsErr) console.error("[cancel-units] gagal hapus transaction_items:", deleteItemsErr.message);

        // 6. Hitung ulang total transaksi dari sisa unit
        const priceCancelled = itemsToCancel.reduce((s, it) => s + (Number(it.deal_price) || 0), 0);
        const costCancelled = itemsToCancel.reduce((s, it) => s + (Number(it.selling_price) || 0), 0);

        const newDealPrice = Math.max(0, Number(transaction.deal_price || transaction.amount || 0) - priceCancelled);
        const newInventoryPrice = Math.max(0, Number(transaction.inventory_price || 0) - costCancelled);
        const newGrossProfit = newDealPrice - newInventoryPrice;

        const remainingSNs = itemsRemaining.map((it) => it.serial_number).filter(Boolean) as string[];
        const remainingUnitIds = itemsRemaining.map((it) => it.unit_id).filter(Boolean) as string[];
        const primaryItem = itemsRemaining[0];

        const displayLaptopName = itemsRemaining.length > 1
            ? `${primaryItem.laptop_name} (+${itemsRemaining.length - 1} unit)`
            : primaryItem.laptop_name;

        const cancelledSNsLabel = itemsToCancel.map((it) => it.serial_number).join(", ");

        // 7. Update transaksi — total harga & referensi unit disesuaikan, status TIDAK berubah
        const { error: updateTxErr } = await supabase
            .from("transactions")
            .update({
                unit_ids: remainingUnitIds,
                serial_numbers: remainingSNs,
                serial_number: remainingSNs.join(", "),
                laptop_name: displayLaptopName,
                unit_id: primaryItem.unit_id,
                laptop_id: primaryItem.laptop_id ?? transaction.laptop_id,
                deal_price: newDealPrice,
                amount: newDealPrice,
                inventory_price: newInventoryPrice,
                other: newGrossProfit,
                last_edited_by: user.name,
                last_edited_at: new Date().toISOString(),
                notes: transaction.notes
                    ? `${transaction.notes} | [PARTIAL CANCEL SN: ${cancelledSNsLabel} oleh ${user.name} — ${reason}]`
                    : `[PARTIAL CANCEL SN: ${cancelledSNsLabel} oleh ${user.name} — ${reason}]`,
            })
            .eq("invoice_number", invoice);

        if (updateTxErr) {
            return NextResponse.json({ success: false, message: updateTxErr.message }, { status: 400 });
        }

        // 8. Log aktivitas
        await logActivity({
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            action: "PARTIAL_CANCEL",
            entity: "transaction",
            entityId: transaction.id,
            entityLabel: `${invoice} — ${transaction.customer_name} (batal sebagian: ${cancelledSNsLabel})`,
            reason,
            beforeData: transaction,
        });

        return NextResponse.json({
            success: true,
            message: `${cancelledUnitIds.length} unit dibatalkan & dikembalikan ke stok. Sisa ${itemsRemaining.length} unit tetap berjalan di transaksi ini.`,
            unitCancelled: cancelledUnitIds.length,
            unitsRemaining: itemsRemaining.length,
        });
    } catch (err: any) {
        console.error("[cancel-units]", err);
        return NextResponse.json({ success: false, message: err?.message ?? "Unknown error" }, { status: 500 });
    }
}

export const POST = withAuth(handler, PERMISSIONS.RESTORE_TRANSACTION);