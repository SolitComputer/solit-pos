import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth } from "@/lib/auth";
import { ACCESSORY_VIEW_ROLES } from "@/lib/permissions";

// ── Sanitasi term sebelum ditaruh mentah di string filter PostgREST (.or()) ──
// Karakter koma/kurung punya arti khusus di syntax filter Supabase — kalau
// tidak dibuang, user bisa menyisipkan kondisi filter tambahan lewat kotak
// pencarian (filter injection).
function sanitizeFilterTerm(raw: string): string {
    return raw.replace(/[,()]/g, "").trim();
}

export const GET = withAuth(async (req: NextRequest) => {
    const q = sanitizeFilterTerm(new URL(req.url).searchParams.get("q")?.trim() ?? "");

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
}, ACCESSORY_VIEW_ROLES);