// C:\solit-pos\src\app\api\dashboard\transactions\route.ts
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

    const { data: transactions, error } = await supabase
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

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // ── Batch fetch purchase_price dari laptop_units ──────────────
    const allUnitIds = new Set<string>();
    for (const trx of transactions) {
      if (trx.unit_id) allUnitIds.add(trx.unit_id);
      if (Array.isArray(trx.unit_ids)) {
        for (const uid of trx.unit_ids) { if (uid) allUnitIds.add(uid); }
      }
    }

    const unitMap = new Map<string, number>();
    if (allUnitIds.size > 0) {
      const { data: units } = await supabase
        .from("laptop_units")
        .select("id, purchase_price")
        .in("id", Array.from(allUnitIds));
      for (const unit of units ?? []) {
        unitMap.set(unit.id, Number(unit.purchase_price ?? 0));
      }
    }

    // ── Recalculate margin live ───────────────────────────────────
    const enriched = transactions.map((trx: any) => {
      const dealPrice = Number(trx.deal_price ?? trx.amount ?? 0);
      let totalPurchasePrice = 0;

      if (Array.isArray(trx.unit_ids) && trx.unit_ids.length > 0) {
        for (const uid of trx.unit_ids) {
          totalPurchasePrice += unitMap.get(uid) ?? 0;
        }
      } else if (trx.unit_id) {
        totalPurchasePrice = unitMap.get(trx.unit_id) ?? 0;
      }

      const margin = totalPurchasePrice > 0 ? dealPrice - totalPurchasePrice : 0;
      return { ...trx, other: margin };
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, PERMISSIONS.VIEW_DASHBOARD);