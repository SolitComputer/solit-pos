// src/app/api/cc-reports/sync/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { syncPosting } from "@/lib/ccSync";
import { isAutoSyncPlatform } from "@/lib/ccMetrics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Auth ditangani middleware:
//  - cron  → header x-cron-secret
//  - user  → cookie sesi + ROUTE_PERMISSIONS["/api/cc-reports"]
export async function POST() {
  const { data, error } = await supabaseAdmin
    .from("cc_postings")
    .select("id, platform, post_url, auto_sync, external_id")
    .not("post_url", "is", null);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const targets = (data ?? []).filter(
    (p) => p.auto_sync !== false && isAutoSyncPlatform(p.platform)
  );

  let ok = 0;
  let failed = 0;

  for (const p of targets) {
    const out = await syncPosting(p.post_url);
    const patch: Record<string, unknown> = {
      last_synced_at: new Date().toISOString(),
      sync_status: out.status,
      sync_error: out.error,
      external_id: out.externalId ?? p.external_id,
    };
    if (out.status === "OK") {
      patch.views = out.views;
      patch.likes = out.likes;
      patch.comments = out.comments;
      ok++;
    } else {
      failed++;
    }
    await supabaseAdmin.from("cc_postings").update(patch).eq("id", p.id);
  }

  return NextResponse.json({ success: true, total: targets.length, ok, failed });
}