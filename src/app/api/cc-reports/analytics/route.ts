// src/app/api/cc-reports/analytics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import type { CCPosting, CCReport, CCTimelinePoint } from "@/lib/ccReports";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const MAX_POINTS = 400; // guard biar chart nggak meledak di range "all"

/** Key harian pakai timezone WIB (sv-SE = format YYYY-MM-DD) */
function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
}

function shiftKey(key: string, days: number): string {
  const d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// GET /api/cc-reports/analytics?platform=Instagram&range=30|7|90|all
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const platform = sp.get("platform")?.trim() || null;
  const rangeRaw = (sp.get("range") ?? "30").toLowerCase();
  const days = rangeRaw === "all" ? 0 : Math.max(1, Number(rangeRaw) || 30);

  const { data, error } = await supabaseAdmin
    .from("cc_reports")
    .select("id, title, postings:cc_postings(*)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Pick<CCReport, "id" | "title" | "postings">[];

  const now = Date.now();
  const startCur = days ? now - days * DAY_MS : 0;
  const startPrev = days ? now - 2 * days * DAY_MS : 0;

  const ts = (p: CCPosting) => (p.posted_at ? new Date(p.posted_at).getTime() : NaN);
  const inCurrent = (p: CCPosting) => {
    if (!days) return true;              // "all" → semua masuk
    const t = ts(p);
    return !Number.isNaN(t) && t >= startCur && t <= now;
  };
  const inPrevious = (p: CCPosting) => {
    if (!days) return false;
    const t = ts(p);
    return !Number.isNaN(t) && t >= startPrev && t < startCur;
  };
  const matchPlatform = (p: CCPosting) => !platform || p.platform === platform;

  const perContent: {
    report_id: string; title: string; views: number; likes: number;
    comments: number; postCount: number; platforms: string[];
  }[] = [];

  const platformAgg = new Map<string, { platform: string; views: number; likes: number; comments: number; count: number }>();
  const dailyAgg = new Map<string, { views: number; likes: number; comments: number; posts: number }>();
  const topPosts: {
    id: string; title: string; platform: string; post_url: string | null;
    posted_at: string | null; views: number; likes: number; comments: number;
  }[] = [];

  let tViews = 0, tLikes = 0, tComments = 0, tPosts = 0;
  let pViews = 0, pLikes = 0, pComments = 0, pPosts = 0;

  for (const r of rows) {
    const all = ((r.postings ?? []) as CCPosting[]).filter(matchPlatform);

    // ── periode sebelumnya (buat delta %) ──
    for (const p of all.filter(inPrevious)) {
      pViews += p.views || 0;
      pLikes += p.likes || 0;
      pComments += p.comments || 0;
      pPosts += 1;
    }

    const postings = all.filter(inCurrent);
    if (postings.length === 0) continue;

    const views = postings.reduce((s, p) => s + (p.views || 0), 0);
    const likes = postings.reduce((s, p) => s + (p.likes || 0), 0);
    const comments = postings.reduce((s, p) => s + (p.comments || 0), 0);

    perContent.push({
      report_id: r.id,
      title: r.title,
      views, likes, comments,
      postCount: postings.length,
      platforms: [...new Set(postings.map((p) => p.platform))],
    });

    for (const p of postings) {
      const cur = platformAgg.get(p.platform) ?? { platform: p.platform, views: 0, likes: 0, comments: 0, count: 0 };
      cur.views += p.views || 0;
      cur.likes += p.likes || 0;
      cur.comments += p.comments || 0;
      cur.count += 1;
      platformAgg.set(p.platform, cur);

      tViews += p.views || 0;
      tLikes += p.likes || 0;
      tComments += p.comments || 0;
      tPosts += 1;

      topPosts.push({
        id: p.id,
        title: r.title,
        platform: p.platform,
        post_url: p.post_url,
        posted_at: p.posted_at,
        views: p.views || 0,
        likes: p.likes || 0,
        comments: p.comments || 0,
      });

      // timeline hanya untuk posting yang punya posted_at
      if (p.posted_at) {
        const k = dayKey(p.posted_at);
        const d = dailyAgg.get(k) ?? { views: 0, likes: 0, comments: 0, posts: 0 };
        d.views += p.views || 0;
        d.likes += p.likes || 0;
        d.comments += p.comments || 0;
        d.posts += 1;
        dailyAgg.set(k, d);
      }
    }
  }

  // ── susun timeline (isi tanggal kosong biar garisnya kontinu ala chart trading) ──
  const timeline: CCTimelinePoint[] = [];
  const keys = [...dailyAgg.keys()].sort();

  if (keys.length > 0) {
    const todayKey = dayKey(new Date(now).toISOString());
    const firstKey = days ? dayKey(new Date(startCur).toISOString()) : keys[0];
    const startKey = firstKey < keys[0] ? firstKey : keys[0];

    let cursor = startKey;
    let cumViews = 0, cumLikes = 0, cumComments = 0;
    let guard = 0;

    while (cursor <= todayKey && guard < MAX_POINTS) {
      const d = dailyAgg.get(cursor) ?? { views: 0, likes: 0, comments: 0, posts: 0 };
      cumViews += d.views;
      cumLikes += d.likes;
      cumComments += d.comments;
      timeline.push({ date: cursor, ...d, cumViews, cumLikes, cumComments });
      cursor = shiftKey(cursor, 1);
      guard++;
    }
  }

  perContent.sort((a, b) => b.views - a.views);
  topPosts.sort((a, b) => b.views - a.views);

  return NextResponse.json({
    success: true,
    range: rangeRaw,
    timeline,
    perContent,
    platformTotals: Array.from(platformAgg.values()).sort((a, b) => b.views - a.views),
    topPosts: topPosts.slice(0, 8),
    totals: { views: tViews, likes: tLikes, comments: tComments, postCount: tPosts, contentCount: perContent.length },
    prevTotals: { views: pViews, likes: pLikes, comments: pComments, postCount: pPosts },
  });
}