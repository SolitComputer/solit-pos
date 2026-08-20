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

// ── Tambah: range untuk bulan tertentu (WIB-aware) ──────────────────
function getMonthWIBRange(year: number, month: number): { start: string; end: string } {
  const WIB = 7 * 60 * 60 * 1000;
  // Awal bulan: 1 bulan ini jam 00:00 WIB = UTC - 7 jam
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0) - WIB);
  // Awal bulan berikutnya (exclusive end)
  const end   = new Date(Date.UTC(year, month, 1, 0, 0, 0) - WIB);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const monthParam = searchParams.get("month");
    const yearParam  = searchParams.get("year");

    let start: string;
    let end: string;
    let limitRows = 10; // default harian

    if (monthParam && yearParam) {
      const month = parseInt(monthParam, 10);
      const year  = parseInt(yearParam, 10);

      // Validasi nilai
      if (
        isNaN(month) || isNaN(year) ||
        month < 1 || month > 12 ||
        year < 2000 || year > 2100
      ) {
        return NextResponse.json(
          { success: false, message: "Parameter month/year tidak valid" },
          { status: 400 }
        );
      }

      ({ start, end } = getMonthWIBRange(year, month));
      limitRows = 500; // bulan bisa banyak transaksi
    } else {
      ({ start, end } = getTodayWIBRange());
    }

    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("status", "PAID")
      .gte("paid_at", start)
      .lt("paid_at", end)
      .order("paid_at", { ascending: false, nullsFirst: false })
      .limit(limitRows);

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

    // ✅ SECURITY FIX: dulu margin (`other`) & `inventory_price` ikut terkirim ke
    // SEMUA role (VIEW_DASHBOARD). Frontend menyembunyikan kolomnya untuk
    // non-finance, tapi datanya tetap ada di payload. Sekarang field profit
    // hanya dikirim ke role finance; selain itu di-nol-kan / dibuang.
    const showFin = (user.roles ?? [user.role]).some(
      (r) => (PERMISSIONS.VIEW_FINANCIALS as string[]).includes(r)
    );

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
      const row = { ...trx, other: showFin ? margin : 0 };
      if (!showFin) delete row.inventory_price;
      return row;
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, PERMISSIONS.VIEW_DASHBOARD);