// src/app/api/cc-reports/[id]/postings/[postingId]/route.ts
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";
import { parsePostUrl } from "@/lib/ccMetrics";
import { buildPostingPatch, syncPosting } from "@/lib/ccSync";   // ← ganti import

export const dynamic = "force-dynamic";

const FIELDS = ["platform", "post_url", "posted_at", "views", "likes", "comments", "auto_sync"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; postingId: string }> }
) {
  const { id, postingId } = await params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body tidak valid" }, { status: 400 });
  }

  const patch: Record<string, any> = {};
  for (const k of FIELDS) {
    if (k in body) {
      if (k === "views" || k === "likes" || k === "comments") patch[k] = Number(body[k]) || 0;
      else patch[k] = body[k] === "" ? null : body[k];
    }
  }

  let syncMessage: string | null = null;
  let synced = false;

  if ("post_url" in patch) {
    const url: string | null = patch.post_url;
    const parsed = url ? parsePostUrl(url) : null;

    patch.external_id = parsed?.externalId ?? null;
    if (parsed && !("platform" in body)) patch.platform = parsed.platform;

    if (url) {
      const out = await syncPosting(url);
      // ✅ hanya menulis metrik yang benar-benar didapat (0 palsu tidak masuk)
      Object.assign(patch, buildPostingPatch(out, { external_id: patch.external_id }));
      synced = out.status === "OK";
      if (out.status !== "OK") syncMessage = out.error;
    } else {
      patch.sync_status = "PENDING";
      patch.sync_error = null;
      patch.last_synced_at = null;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("cc_postings")
    .update(patch)
    .eq("id", postingId)
    .eq("report_id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, posting: data, synced, message: syncMessage });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; postingId: string }> }
) {
  const { id, postingId } = await params;

  const { error } = await supabaseAdmin
    .from("cc_postings")
    .delete()
    .eq("id", postingId)
    .eq("report_id", id);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}