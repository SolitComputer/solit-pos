// src/app/api/akutansi/accounts/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

export const GET = withAuth(async () => {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("code, name, type")
        .order("code", { ascending: true });

    if (error) {
        console.error("[akutansi accounts GET]", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
}, AKUNTANSI_ROLES);