import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

interface Props {
    params: Promise<{ invoice: string }>;
}

async function restoreHandler(req: NextRequest, props: Props, user: AuthUser) {
    try {
        const { invoice } = await props.params;

        const { data: transaction, error: txError } = await supabase
            .from("transactions")
            .select("*")
            .eq("invoice_number", invoice)
            .single();

        if (txError || !transaction) {
            return NextResponse.json(
                { success: false, message: "Transaksi tidak ditemukan" },
                { status: 404 }
            );
        }

        if (transaction.status !== "PAID") {
            return NextResponse.json(
                { success: false, message: `Transaksi dengan status "${transaction.status}" tidak bisa di-restore` },
                { status: 400 }
            );
        }

        const { data: unit, error: unitError } = await supabase
            .from("laptop_units")
            .select("id, laptop_id, status")
            .eq("serial_number", transaction.serial_number)
            .single();

        if (unitError || !unit) {
            console.warn(`[RESTORE] Unit SN ${transaction.serial_number} tidak ditemukan`);
        }

        const { error: updateTxError } = await supabase
            .from("transactions")
            .update({
                status: "CANCELLED",
                last_edited_by: user.name,
                last_edited_at: new Date().toISOString(),
                notes: transaction.notes
                    ? `${transaction.notes} | [RESTORED by ${user.name}]`
                    : `[RESTORED by ${user.name}]`,
            })
            .eq("invoice_number", invoice);

        if (updateTxError) {
            return NextResponse.json(
                { success: false, message: updateTxError.message },
                { status: 400 }
            );
        }

        if (unit) {
            await supabase
                .from("laptop_units")
                .update({ status: "SIAP_JUAL" })
                .eq("id", unit.id);

            const { data: siapUnits } = await supabase
                .from("laptop_units")
                .select("id")
                .eq("laptop_id", unit.laptop_id)
                .eq("status", "SIAP_JUAL");

            const newQty = (siapUnits?.length ?? 0);

            await supabase
                .from("laptops")
                .update({
                    qty: newQty,
                    status: newQty > 0 ? "SIAP_JUAL" : "SOLD",
                })
                .eq("id", unit.laptop_id);
        }

        console.log(`[RESTORE] Invoice ${invoice} di-restore oleh ${user.name}`);

        return NextResponse.json({
            success: true,
            message: "Transaksi berhasil di-restore. Stok unit dikembalikan.",
            unitRestored: !!unit,
        });

    } catch (error) {
        console.error("[RESTORE] Error:", error);
        return NextResponse.json(
            { success: false, message: String(error) },
            { status: 500 }
        );
    }
}

export const POST = withAuth(restoreHandler, PERMISSIONS.EDIT_TRANSACTION);