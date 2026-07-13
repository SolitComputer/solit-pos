// src/app/api/cc-reports/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { buildPostingPatch, syncPosting } from "@/lib/ccSync";
import { isAutoSyncPlatform, isStale } from "@/lib/ccMetrics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONCURRENCY = 4;

// POST /api/cc-reports/sync?stale=30  → hanya yang basi >30 menit
// POST /api/cc-reports/sync?force=1   → semua
export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const force = sp.get("force") === "1";
  const staleMin = Number(sp.get("stale")) || 0;

  const { data, error } = await supabaseAdmin
    .from("cc_postings")
    .select("id, platform, post_url, auto_sync, external_id, last_synced_at")
    .not("post_url", "is", null);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const targets = (data ?? []).filter(
    (p) =>
      p.auto_sync !== false &&
      isAutoSyncPlatform(p.platform) &&
      (force || staleMin === 0 || isStale(p.last_synced_at, staleMin))
  );

  let ok = 0;
  let partial = 0;
  let failed = 0;

  // batch kecil — hindari rate limit IG (200 req/jam/akun)
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (p) => {
        const out = await syncPosting(p.post_url);
        if (out.status === "OK") ok++;
        else if (out.status === "PARTIAL") partial++;
        else failed++;

        await supabaseAdmin
          .from("cc_postings")
          .update(buildPostingPatch(out, p))
          .eq("id", p.id);
      })
    );
  }

  return NextResponse.json({
    success: true,
    total: targets.length,
    ok,
    partial,
    failed,
  });
}