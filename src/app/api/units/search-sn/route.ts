import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams.get("q") || "";

    if (q.length < 2) {
        return NextResponse.json({ data: [] });
    }

    const { data, error } = await supabase
        .from("laptop_units")
        .select(`
        id,
        serial_number,
        grade,
        selling_price,
        condition_note,
        status,
        laptops (
            id,
            laptop_name
        )
    `)
        .ilike("serial_number", `%${q}%`)
        .eq("status", "SIAP_JUAL")  
        .limit(8)
        .order("serial_number");

    if (error) {
        console.error("search-sn error:", error);
        return NextResponse.json({ data: [] });
    }

    const formatted = (data || []).map((u: any) => ({
        id: u.id,
        serial_number: u.serial_number,
        grade: u.grade,
        selling_price: u.selling_price,
        condition_note: u.condition_note,
        status: u.status,
        laptop_id: u.laptops?.id || "",
        laptop_name: u.laptops?.laptop_name || "",
    }));

    return NextResponse.json({ data: formatted });
}