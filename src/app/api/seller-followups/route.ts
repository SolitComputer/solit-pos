import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { isDue } from "@/lib/sellerFollowup";

async function getHandler(req: NextRequest, _ctx: { params: any }, _user: AuthUser) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? "ALL";       
    const scope = url.searchParams.get("scope") ?? "ACTIVE";  
    const search = (url.searchParams.get("search") ?? "").trim();

    let query = supabase
      .from("seller_followups")
      .select("*")
      .order("next_followup_at", { ascending: true });

    if (type === "USER" || type === "PEDAGANG") query = query.eq("seller_type", type);
    if (scope === "ACTIVE") query = query.eq("is_active", true);
    else if (scope === "ARCHIVED") query = query.eq("is_active", false);

    if (search) {
      query = query.or(
        `customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,invoice_number.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    const now = new Date();
    const enriched = (data ?? []).map((row: any) => ({
      ...row,
      is_due: isDue(row.next_followup_at, now),
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (err: any) {
    console.error("[GET /api/seller-followups]", err);
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, PERMISSIONS.VIEW_SELLER_FOLLOWUP);