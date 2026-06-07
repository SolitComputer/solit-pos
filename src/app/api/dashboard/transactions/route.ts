import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

function getTodayWIB(): string {
  const WIB = 7 * 60 * 60 * 1000;
  const nowWIB = new Date(Date.now() + WIB);
  return nowWIB.toISOString().split("T")[0]; // "2026-06-07"
}

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const today = getTodayWIB();

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("pickup_date", today)                           // ← tanggal transaksi
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