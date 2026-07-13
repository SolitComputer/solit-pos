// src/app/api/cc-reports/analytics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import type {
  CCPosting, CCContentRow, CCMetricTotals, CCPlatformStat,
  CCProcessRow, CCProcessSummary, CCSyncIssue, CCSyncIssueSummary,
  CCBrand, BrandFilter,
} from "@/lib/ccReports";
import { minutesBetween, resolveRange, isCCBrand } from "@/lib/ccReports";
import { isAutoSyncPlatform, type SyncStatus } from "@/lib/ccMetrics";

export const dynamic = "force-dynamic";

const emptyTotals = (): CCMetricTotals => ({ views: 0, likes: 0, comments: 0, postCount: 0 });

interface ReportRow {
  id: string;
  title: string;
  brand: CCBrand;
  created_at: string;
  take_done: boolean;
  edit_done: boolean;
  take_start: string | null;
  take_end: string | null;
  take_received_editor: string | null;
  edit_start: string | null;
  edit_end: string | null;
  postings: CCPosting[] | null;
}

const avg = (arr: number[]): number | null =>
  arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const rr = resolveRange(sp.get("range"), sp.get("from"), sp.get("to"));

  const brandRaw = sp.get("brand");
  const brand: BrandFilter = isCCBrand(brandRaw) ? brandRaw : "ALL";

  let query = supabaseAdmin
    .from("cc_reports")
    .select(
      "id, title, brand, created_at, take_done, edit_done, take_start, take_end, take_received_editor, edit_start, edit_end, postings:cc_postings(*)"
    )
    .order("created_at", { ascending: false });

  // ✅ brand difilter di DB, bukan di memori
  if (brand !== "ALL") query = query.eq("brand", brand);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as ReportRow[];

  const ts = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);

  /**
   * posted_at boleh kosong → fallback ke created_at report, supaya posting
   * tidak "hilang" dari analisa hanya karena tanggalnya belum diisi.
   */
  const inWindow = (
    p: CCPosting,
    fallbackIso: string,
    start: number | null,
    end: number | null
  ): boolean => {
    if (start === null && end === null) return false; // periode pembanding tidak ada
    const t = ts(p.posted_at ?? fallbackIso);
    if (Number.isNaN(t)) return false;
    if (start !== null && t < start) return false;
    if (end !== null && t > end) return false;
    return true;
  };

  const contents: CCContentRow[] = [];
  const byBrand: Record<string, CCMetricTotals> = {};
  const prevByPlatform: Record<string, CCMetricTotals> = {};
  const processRows: CCProcessRow[] = [];
  let lastSyncedAt: string | null = null;

  const issues: CCSyncIssueSummary = { ok: 0, partial: 0, error: 0, pending: 0 };
  const problems: CCSyncIssue[] = [];

  for (const r of rows) {
    const all = r.postings ?? [];

    // ── kesehatan sync (tidak terikat rentang waktu) ──
    for (const p of all) {
      if (p.last_synced_at && (!lastSyncedAt || p.last_synced_at > lastSyncedAt)) {
        lastSyncedAt = p.last_synced_at;
      }

      if (!isAutoSyncPlatform(p.platform) || !p.post_url) continue;
      const st = (p.sync_status ?? "PENDING") as SyncStatus;

      if (st === "OK") issues.ok++;
      else if (st === "PARTIAL") issues.partial++;
      else if (st === "ERROR") issues.error++;
      else if (st === "PENDING") issues.pending++;

      if (st === "PARTIAL" || st === "ERROR") {
        problems.push({
          report_id: r.id,
          title: r.title,
          platform: p.platform,
          post_url: p.post_url,
          sync_status: st,
          sync_error: p.sync_error ?? null,
          last_synced_at: p.last_synced_at ?? null,
        });
      }
    }

    // ── periode pembanding (buat delta %) ──
    for (const p of all) {
      if (!inWindow(p, r.created_at, rr.startPrev, rr.endPrev)) continue;
      const t = (prevByPlatform[p.platform] ??= emptyTotals());
      t.views += p.views || 0;
      t.likes += p.likes || 0;
      t.comments += p.comments || 0;
      t.postCount += 1;
    }

    // ── proses pengerjaan (difilter by created_at) ──
    const createdAt = ts(r.created_at);
    const createdIn =
      (rr.startCur === null || createdAt >= rr.startCur) && createdAt <= rr.endCur;

    if (createdIn) {
      processRows.push({
        report_id: r.id,
        title: r.title,
        brand: r.brand,
        takeMinutes: minutesBetween(r.take_start, r.take_end),
        handoffMinutes: minutesBetween(r.take_end, r.take_received_editor),
        editMinutes: minutesBetween(r.edit_start, r.edit_end),
        totalMinutes: minutesBetween(r.take_start, r.edit_end),
        take_done: r.take_done,
        edit_done: r.edit_done,
      });
    }

    // ── performa per konten × platform ──
    const current = all.filter((p) => inWindow(p, r.created_at, rr.startCur, rr.endCur));
    if (current.length === 0) continue;

    const perPlatform: Record<string, CCPlatformStat> = {};
    const totals = emptyTotals();
    const brandTotals = (byBrand[r.brand] ??= emptyTotals());

    for (const p of current) {
      const stat = (perPlatform[p.platform] ??= {
        platform: p.platform,
        post_url: p.post_url,
        posted_at: p.posted_at,
        ...emptyTotals(),
      });
      stat.views += p.views || 0;
      stat.likes += p.likes || 0;
      stat.comments += p.comments || 0;
      stat.postCount += 1;
      if (!stat.post_url && p.post_url) stat.post_url = p.post_url;
      if (!stat.posted_at && p.posted_at) stat.posted_at = p.posted_at;

      totals.views += p.views || 0;
      totals.likes += p.likes || 0;
      totals.comments += p.comments || 0;
      totals.postCount += 1;

      brandTotals.views += p.views || 0;
      brandTotals.likes += p.likes || 0;
      brandTotals.comments += p.comments || 0;
      brandTotals.postCount += 1;
    }

    contents.push({
      report_id: r.id,
      title: r.title,
      brand: r.brand,
      perPlatform,
      platforms: Object.keys(perPlatform),
      totals,
    });
  }

  contents.sort((a, b) => b.totals.views - a.totals.views);

  problems.sort((a, b) => {
    if (a.sync_status === b.sync_status) return a.title.localeCompare(b.title);
    return a.sync_status === "ERROR" ? -1 : 1;
  });

  const summary: CCProcessSummary = {
    avgTake: avg(processRows.map((r) => r.takeMinutes).filter((v): v is number => v != null)),
    avgHandoff: avg(processRows.map((r) => r.handoffMinutes).filter((v): v is number => v != null)),
    avgEdit: avg(processRows.map((r) => r.editMinutes).filter((v): v is number => v != null)),
    avgTotal: avg(processRows.map((r) => r.totalMinutes).filter((v): v is number => v != null)),
    count: processRows.length,
  };

  return NextResponse.json({
    success: true,
    range: rr.key,
    rangeLabel: rr.label,
    period: { from: rr.from, to: rr.to },
    brand,
    contents,
    byBrand,
    prevByPlatform,
    process: { rows: processRows, summary },
    lastSyncedAt,
    issues,
    problems,
  });
}