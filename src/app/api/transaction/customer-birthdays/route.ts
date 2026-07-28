import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

function calculateBirthdayDiff(birthDateStr: string, today: Date = new Date()) {
    const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const currentYear = todayZero.getFullYear();

    const bdParts = birthDateStr.split("-");
    const birthYear = parseInt(bdParts[0], 10);
    const birthMonth = parseInt(bdParts[1], 10); // 1-indexed
    const birthDay = parseInt(bdParts[2], 10);

    if (isNaN(birthYear) || isNaN(birthMonth) || isNaN(birthDay)) return null;

    const candidateYears = [currentYear - 1, currentYear, currentYear + 1];
    let bestCandidate: { diffDays: number; age: number; birthdayDate: Date } | null = null;

    for (const year of candidateYears) {
        let bDate = new Date(year, birthMonth - 1, birthDay);
        if (bDate.getMonth() !== birthMonth - 1) {
            bDate = new Date(year, birthMonth - 1, 28);
        }

        const timeDiff = bDate.getTime() - todayZero.getTime();
        const diffDays = Math.round(timeDiff / (1000 * 3600 * 24));
        const age = year - birthYear;

        if (bestCandidate === null || Math.abs(diffDays) < Math.abs(bestCandidate.diffDays)) {
            bestCandidate = { diffDays, age, birthdayDate: bDate };
        }
    }

    return bestCandidate;
}

async function getHandler(req: NextRequest, ctx: any, user: AuthUser) {
    const today = new Date();

    const { data, error } = await supabaseAdmin
        .from("transactions")
        .select("id, invoice_number, customer_name, customer_phone, customer_birth_date, sales_name, sales_id, created_at")
        .not("customer_birth_date", "is", null)
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const birthdayCustomers: any[] = [];
    const seenPhones = new Set<string>();

    for (const tx of data ?? []) {
        if (!tx.customer_birth_date) continue;
        const res = calculateBirthdayDiff(tx.customer_birth_date, today);
        if (!res) continue;

        const { diffDays, age } = res;

        // Filter: H-3 s.d H+3 (diffDays antara -3 dan +3)
        if (diffDays >= -3 && diffDays <= 3) {
            const key = (tx.customer_phone?.trim() || tx.customer_name?.trim() || "").toLowerCase();
            if (seenPhones.has(key)) continue;
            seenPhones.add(key);

            birthdayCustomers.push({
                id: tx.id,
                customer_name: tx.customer_name,
                customer_phone: tx.customer_phone,
                customer_birth_date: tx.customer_birth_date,
                age,
                diff_days: diffDays,
                sales_name: tx.sales_name,
                sales_id: tx.sales_id,
                invoice_number: tx.invoice_number,
                transaction_date: tx.created_at,
            });
        }
    }

    // Urutkan: Hari ini (diff_days === 0) paling atas,
    // lalu H-1 (1), H-2 (2), H-3 (3), lalu H+1 (-1), H+2 (-2), H+3 (-3).
    const getSortPriority = (d: number) => {
        if (d === 0) return 0;
        if (d > 0) return d;
        return 10 + Math.abs(d);
    };

    birthdayCustomers.sort((a, b) => getSortPriority(a.diff_days) - getSortPriority(b.diff_days));

    return NextResponse.json({ success: true, customers: birthdayCustomers });
}

export const GET = withAuth(getHandler);        