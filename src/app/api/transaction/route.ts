// C:\solit-pos\src\app\api\transaction\route.ts

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get("search") ?? "";
    const status = url.searchParams.get("status") ?? "ALL";

    // ── 1. Fetch transactions ──────────────────────────────────────
    let query = supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false });

    if (status !== "ALL") {
      query = query.eq("status", status);
    }

    if (search.trim()) {
      query = query.or(
        `invoice_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,laptop_name.ilike.%${search}%`
      );
    }

    const { data: transactions, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // ── 2. Kumpulkan semua unit ID yang perlu di-fetch ─────────────
    const allUnitIds = new Set<string>();

    for (const trx of transactions) {
      // Single unit (transaksi lama)
      if (trx.unit_id) allUnitIds.add(trx.unit_id);

      // Multi unit (transaksi baru — unit_ids adalah array uuid)
      if (Array.isArray(trx.unit_ids)) {
        for (const uid of trx.unit_ids) {
          if (uid) allUnitIds.add(uid);
        }
      }
    }

    // ── 3. Batch fetch semua units sekaligus (bukan N+1) ──────────
    let unitMap = new Map<string, number>(); // id → purchase_price

    if (allUnitIds.size > 0) {
      const { data: units } = await supabase
        .from("laptop_units")
        .select("id, purchase_price")
        .in("id", Array.from(allUnitIds));

      for (const unit of units ?? []) {
        unitMap.set(unit.id, Number(unit.purchase_price ?? 0));
      }
    }

    // ── 4. Recalculate margin live untuk setiap transaksi ─────────
    const enriched = transactions.map((trx: any) => {
      const dealPrice = Number(trx.deal_price ?? trx.amount ?? 0);

      // Kumpulkan semua purchase_price yang relevan
      let totalPurchasePrice = 0;

      // Prioritas: unit_ids (multi-unit) dulu
      if (Array.isArray(trx.unit_ids) && trx.unit_ids.length > 0) {
        for (const uid of trx.unit_ids) {
          totalPurchasePrice += unitMap.get(uid) ?? 0;
        }
      } else if (trx.unit_id) {
        // Fallback ke single unit_id
        totalPurchasePrice = unitMap.get(trx.unit_id) ?? 0;
      }

      // Kalau purchase_price masih 0 → margin 0 (bukan bug, memang belum diisi)
      const margin = totalPurchasePrice > 0 ? dealPrice - totalPurchasePrice : 0;

      return {
        ...trx,
        other: margin,                          // override field margin
        purchase_price_current: totalPurchasePrice, // expose untuk debug
      };
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    console.error("[GET /api/transaction]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler);