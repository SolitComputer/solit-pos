import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_DELIVERY_ROLES } from "@/lib/permissions";

async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    const countOnly = new URL(req.url).searchParams.get("count") === "1";

    if (countOnly) {
      const { count, error } = await supabase
        .from("preparation_orders")
        .select("*", { count: "exact", head: true })
        .eq("delivery_user_id", user.id)
        .eq("delivery_method", "PENGANTARAN")
        .eq("status", "DIKIRIM");
      if (error) throw error;
      return NextResponse.json({ success: true, count: count ?? 0 });
    }

    const { data, error } = await supabase
      .from("preparation_orders")
      .select("*, preparation_items(*)")
      .eq("delivery_user_id", user.id)
      .eq("delivery_method", "PENGANTARAN")
      .in("status", ["DIKIRIM", "SELESAI"])
      .order("updated_at", { ascending: false })
      .limit(60);
    if (error) throw error;

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err) {
    console.error("[GET /api/preparation/my-deliveries]", err);
    return NextResponse.json({ success: false, message: "Gagal mengambil tugas pengantaran" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, PREPARATION_DELIVERY_ROLES);