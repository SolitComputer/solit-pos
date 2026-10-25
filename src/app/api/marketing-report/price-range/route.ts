import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth } from "@/lib/auth";
import { fetchAllRows } from "@/lib/supabase-paginate";
import {
  aggregateMarketingReport,
  resolveDateRangeUtc,
  type AuditedReportLite,
  type MarketingReportData,
} from "@/lib/marketing-report";

export const dynamic = "force-dynamic";

const TABLE = "sales_online_reports";

// GET /api/marketing-report/price-range?from=YYYY-MM-DD&to=YYYY-MM-DD
async function getHandler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const range = resolveDateRangeUtc(searchParams.get("from"), searchParams.get("to"));
    if (!range.success) {
      return NextResponse.json({ success: false, message: range.error }, { status: 400 });
    }
     const { startUtc, endUtc } = range.value;
    // "" / "ALL" = tanpa filter toko (gabungan semua toko).
    const storeFilter = (searchParams.get("store") ?? "").trim();

    // Hanya baris yang SUDAH diaudit yang dihitung.
    const { data: auditedData, error: auditedErr } = await fetchAllRows((from, to) => {
      let q = supabaseAdmin
        .from(TABLE)
        .select("channel, price_range")
        .is("deleted_at", null)
        .eq("audited", true);
      if (startUtc) q = q.gte("created_at", startUtc);
      if (endUtc) q = q.lt("created_at", endUtc);
      if (storeFilter && storeFilter !== "ALL") q = q.eq("nama_toko", storeFilter);
      return q.range(from, to);
    });
    if (auditedErr) throw new Error(auditedErr.message);

    // Jumlah laporan yang BELUM diaudit (tidak dihitung, hanya info).
    let pendingQuery = supabaseAdmin
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("audited", false);
    if (startUtc) pendingQuery = pendingQuery.gte("created_at", startUtc);
    if (endUtc) pendingQuery = pendingQuery.lt("created_at", endUtc);
    if (storeFilter && storeFilter !== "ALL") pendingQuery = pendingQuery.eq("nama_toko", storeFilter);
    const { count: pendingAuditCount, error: pendingErr } = await pendingQuery;
    if (pendingErr) throw new Error(pendingErr.message);

    const base = aggregateMarketingReport((auditedData ?? []) as AuditedReportLite[], {
      groupBy: "price_range",
    });

    const data: MarketingReportData = { ...base, pendingAuditCount: pendingAuditCount ?? 0 };
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Marketing price-range report error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);