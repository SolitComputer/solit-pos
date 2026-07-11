// src/app/api/accessories/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, PERMISSIONS } from "@/lib/auth";

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
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: data ?? [] });
}, PERMISSIONS.CREATE_TRANSACTION);