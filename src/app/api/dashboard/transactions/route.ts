import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

function getTodayWIBRange(): { start: string; end: string } {
  const WIB = 7 * 60 * 60 * 1000;
  const nowWIB = new Date(Date.now() + WIB);
  const dateStr = nowWIB.toISOString().split("T")[0];
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - WIB);
  const end   = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - WIB);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { start, end } = getTodayWIBRange();

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("status", "PAID")        
      .gte("paid_at", start)      
      .lt("paid_at", end)
      .order("paid_at", { ascending: false, nullsFirst: false })
      .limit(10);

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, PERMISSIONS.VIEW_DASHBOARD);