import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

async function getHandler(req: NextRequest, ctx: any, user: AuthUser) {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    // Ambil semua transaksi yang customer_birth_date cocok bulan+tanggal hari ini
    // Supabase tidak support EXTRACT langsung, jadi kita query semua yang punya birth_date
    // lalu filter di JS (jumlah transaksi biasanya manageable)
    const { data, error } = await supabaseAdmin
        .from("transactions")
        .select("id, invoice_number, customer_name, customer_phone, customer_birth_date, sales_name, sales_id, created_at")
        .not("customer_birth_date", "is", null)
        .order("customer_name");

    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    // Filter yang ulang tahun hari ini
    const birthdayCustomers: any[] = [];
    const seenPhones = new Set<string>();

    for (const tx of data ?? []) {
        if (!tx.customer_birth_date) continue;
        const bd = new Date(tx.customer_birth_date + "T00:00:00");
        if (bd.getMonth() + 1 === month && bd.getDate() === day) {
            // Dedup by phone number (customer bisa beli berkali-kali)
            const key = tx.customer_phone || tx.customer_name;
            if (seenPhones.has(key)) continue;
            seenPhones.add(key);

            const age = today.getFullYear() - bd.getFullYear();
            birthdayCustomers.push({
                id: tx.id,
                customer_name: tx.customer_name,
                customer_phone: tx.customer_phone,
                customer_birth_date: tx.customer_birth_date,
                age,
                sales_name: tx.sales_name,
                sales_id: tx.sales_id,
                invoice_number: tx.invoice_number,
                transaction_date: tx.created_at,
            });
        }
    }

    return NextResponse.json({ success: true, customers: birthdayCustomers });
}

export const GET = withAuth(getHandler);        