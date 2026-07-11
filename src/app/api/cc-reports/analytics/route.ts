// src/app/api/cc-reports/analytics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import type {
  CCPosting, CCContentRow, CCMetricTotals, CCPlatformStat,
  CCProcessRow, CCProcessSummary,
} from "@/lib/ccReports";
import { minutesBetween } from "@/lib/ccReports";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

const emptyTotals = (): CCMetricTotals => ({ views: 0, likes: 0, comments: 0, postCount: 0 });

interface ReportRow {
  id: string;
  title: string;
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

// GET /api/cc-reports/analytics?range=7|30|90|all
export async function GET(req: NextRequest) {
  const rangeRaw = (req.nextUrl.searchParams.get("range") ?? "30").toLowerCase();
  const days = rangeRaw === "all" ? 0 : Math.max(1, Number(rangeRaw) || 30);

  const { data, error } = await supabaseAdmin
    .from("cc_reports")
    .select(
      "id, title, created_at, take_done, edit_done, take_start, take_end, take_received_editor, edit_start, edit_end, postings:cc_postings(*)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as ReportRow[];

  const now = Date.now();
  const startCur = days ? now - days * DAY_MS : 0;
  const startPrev = days ? now - 2 * days * DAY_MS : 0;

  const ts = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);

  const inCurrent = (p: CCPosting) => {
    if (!days) return true;
    const t = ts(p.posted_at);
    return !Number.isNaN(t) && t >= startCur && t <= now;
  };
  const inPrevious = (p: CCPosting) => {
    if (!days) return false;
    const t = ts(p.posted_at);
    return !Number.isNaN(t) && t >= startPrev && t < startCur;
  };

  const contents: CCContentRow[] = [];
  const prevByPlatform: Record<string, CCMetricTotals> = {};
  const processRows: CCProcessRow[] = [];
  let lastSyncedAt: string | null = null;

  for (const r of rows) {
    const all = r.postings ?? [];

    for (const p of all) {
      if (p.last_synced_at && (!lastSyncedAt || p.last_synced_at > lastSyncedAt)) {
        lastSyncedAt = p.last_synced_at;
      }
    }

    // ── periode sebelumnya (buat delta %) ──
    for (const p of all.filter(inPrevious)) {
      const t = (prevByPlatform[p.platform] ??= emptyTotals());
      t.views += p.views || 0;
      t.likes += p.likes || 0;
      t.comments += p.comments || 0;
      t.postCount += 1;
    }

    // ── proses pengerjaan (difilter by created_at) ──
    const createdIn = !days || ts(r.created_at) >= startCur;
    if (createdIn) {
      processRows.push({
        report_id: r.id,
        title: r.title,
        takeMinutes: minutesBetween(r.take_start, r.take_end),
        handoffMinutes: minutesBetween(r.take_end, r.take_received_editor),
        editMinutes: minutesBetween(r.edit_start, r.edit_end),
        totalMinutes: minutesBetween(r.take_start, r.edit_end),
        take_done: r.take_done,
        edit_done: r.edit_done,
      });
    }

    // ── performa per konten × platform ──
    const current = all.filter(inCurrent);
    if (current.length === 0) continue;

    const perPlatform: Record<string, CCPlatformStat> = {};
    const totals = emptyTotals();

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

      totals.views += p.views || 0;
      totals.likes += p.likes || 0;
      totals.comments += p.comments || 0;
      totals.postCount += 1;
    }

    contents.push({
      report_id: r.id,
      title: r.title,
      perPlatform,
      platforms: Object.keys(perPlatform),
      totals,
    });
  }

  contents.sort((a, b) => b.totals.views - a.totals.views);

  const summary: CCProcessSummary = {
    avgTake: avg(processRows.map((r) => r.takeMinutes).filter((v): v is number => v != null)),
    avgHandoff: avg(processRows.map((r) => r.handoffMinutes).filter((v): v is number => v != null)),
    avgEdit: avg(processRows.map((r) => r.editMinutes).filter((v): v is number => v != null)),
    avgTotal: avg(processRows.map((r) => r.totalMinutes).filter((v): v is number => v != null)),
    count: processRows.length,
  };

  return NextResponse.json({
    success: true,
    range: rangeRaw,
    contents,
    prevByPlatform,
    process: { rows: processRows, summary },
    lastSyncedAt,
  });
}