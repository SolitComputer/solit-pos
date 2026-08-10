import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth } from "@/lib/auth";
import { UserRole } from "@/lib/permissions";

const VIEW_ROLES: UserRole[] = [
    "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
    "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG",
    "TEKNISI", "KEPALA_TEKNISI",
    "KEPALA_SALES", "CREW_SALES",
    "ACCOUNTING", "CUSTOMER_SERVICE",
];

export const GET = withAuth(async (req: NextRequest) => {
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";

    let query = supabaseAdmin
        .from("accessories")
        .select("id, name, category, brand, spec, sell_price, stock")
        .gt("stock", 0)
        .order("name", { ascending: true })
        .limit(15);

    if (q) query = query.or(`name.ilike.%${q}%,brand.ilike.%${q}%,category.ilike.%${q}%`);

    const { data, error } = await query;
    if (error) {
        console.error("[GET /api/accessories/search]", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data ?? [] });
}, VIEW_ROLES);