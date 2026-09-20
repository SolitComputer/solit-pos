import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/services/supabaseAdmin";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

interface Props {
    params: Promise<{ invoice: string }>;
}

// GET — daftar unit laptop (transaction_items) milik 1 invoice, dipakai
// checklist "Tidak Jadi" di halaman Pending Orders supaya user bisa pilih
// unit mana yang mau dibatalkan, bukan seluruh transaksi.
async function handler(req: NextRequest, props: Props, user: AuthUser) {
    try {
        const { invoice } = await props.params;

        const { data: items, error } = await supabase
            .from("transaction_items")
            .select("id, unit_id, serial_number, laptop_name, deal_price, restored")
            .eq("invoice_number", invoice)
            .eq("item_type", "laptop");

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 400 });
        }

        // ✅ FIX: unit yang sudah direstore (restored: true) sudah keluar dari
        // transaksi aktif (balik ke stok SIAP_JUAL). Kalau tidak difilter,
        // unit ini masih muncul di checklist "Pilih Unit yang Dibayar"
        // (ConfirmPaymentModal) dan "Pilih Unit yang Direstore" (RestoreModal)
        // — berisiko konfirmasi-bayar atau restore ulang untuk unit yang
        // sudah tidak aktif di transaksi ini.
        const activeItems = (items ?? []).filter((it: any) => !it.restored);

        return NextResponse.json({ success: true, data: activeItems });
    } catch (err: any) {
        console.error("[transaction/items]", err);
        return NextResponse.json({ success: false, message: err?.message ?? "Unknown error" }, { status: 500 });
    }
}

const ALLOWED_ROLES = Array.from(new Set([...PERMISSIONS.EDIT_TRANSACTION, ...PERMISSIONS.RESTORE_TRANSACTION]));
export const GET = withAuth(handler, ALLOWED_ROLES);