// src/app/api/cc-reports/analytics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import type { CCPosting, CCReport } from "@/lib/ccReports";

export const dynamic = "force-dynamic";

// GET /api/cc-reports/analytics?platform=Instagram
// Ambil hanya konten yang SUDAH ada posting → data untuk grafik.
export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform"); // opsional

  const { data, error } = await supabaseAdmin
    .from("cc_reports")
    .select("id, title, postings:cc_postings(*)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const rows = (data ?? []) as Pick<CCReport, "id" | "title" | "postings">[];

  const perContent: {
    report_id: string;
    title: string;
    views: number;
    likes: number;
    comments: number;
    postCount: number;
    platforms: string[];
  }[] = [];

  const platformAgg = new Map<string, { platform: string; views: number; likes: number; comments: number; count: number }>();

  let tViews = 0, tLikes = 0, tComments = 0, tPosts = 0;

  for (const r of rows) {
    let postings = (r.postings ?? []) as CCPosting[];
    if (platform) postings = postings.filter((p) => p.platform === platform);
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
      tViews += p.views || 0; tLikes += p.likes || 0; tComments += p.comments || 0; tPosts += 1;
    }
  }

  // urutkan konten by views desc
  perContent.sort((a, b) => b.views - a.views);

  return NextResponse.json({
    success: true,
    perContent,
    platformTotals: Array.from(platformAgg.values()).sort((a, b) => b.views - a.views),
    totals: { views: tViews, likes: tLikes, comments: tComments, postCount: tPosts, contentCount: perContent.length },
  });
}