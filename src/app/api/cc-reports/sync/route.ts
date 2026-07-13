// src/app/api/cc-reports/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { buildPostingPatch, syncPosting, clearIgCache } from "@/lib/ccSync";
import { isAutoSyncPlatform, isStale } from "@/lib/ccMetrics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONCURRENCY = 4;

// POST /api/cc-reports/sync?stale=30  → hanya yang basi >30 menit (cron)
// POST /api/cc-reports/sync?force=1   → semua, bypass SEMUA cache (tombol user)
export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const force = sp.get("force") === "1";
  const staleMin = Number(sp.get("stale")) || 0;

  // ✅ Tombol "Sync Metrik" harus benar-benar live → buang cache RAM lebih dulu.
  //    Tanpa ini, request pertama dalam 60 detik dilayani dari cache lama.
  if (force) clearIgCache();

  const { data, error } = await supabaseAdmin
    .from("cc_postings")
    .select("id, platform, post_url, auto_sync, external_id, provider_media_id, last_synced_at")
    .not("post_url", "is", null);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const targets = (data ?? []).filter(
    (p) =>
      p.auto_sync !== false &&
      isAutoSyncPlatform(p.platform) &&
      (force || staleMin === 0 || isStale(p.last_synced_at, staleMin))
  );

  let ok = 0;
  let partial = 0;
  let failed = 0;
  let changed = 0;

  // batch kecil — hindari rate limit IG (200 req/jam/akun)
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (p) => {
        const out = await syncPosting(p.post_url, {
          force,
          mediaId: p.provider_media_id,   // ✅ langsung hit single-media, skip scan list
        });

        if (out.status === "OK") ok++;
        else if (out.status === "PARTIAL") partial++;
        else failed++;

        const patch = buildPostingPatch(out, p);
        if ("likes" in patch || "views" in patch || "comments" in patch) changed++;

        await supabaseAdmin.from("cc_postings").update(patch).eq("id", p.id);
      })
    );
  }

  return NextResponse.json({
    success: true,
    total: targets.length,
    ok,
    partial,
    failed,
    changed,
    at: new Date().toISOString(),
  });
}