// src/app/api/cc-reports/[id]/postings/[postingId]/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { buildPostingPatch, syncPosting, clearIgCache } from "@/lib/ccSync";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; postingId: string }> }
) {
  const { id, postingId } = await params;

  const { data: posting, error: findErr } = await supabaseAdmin
    .from("cc_postings")
    .select("*")
    .eq("id", postingId)
    .eq("report_id", id)
    .single();

  if (findErr || !posting) {
    return NextResponse.json({ success: false, error: "Posting tidak ditemukan" }, { status: 404 });
  }

  // ✅ Sync manual per-posting SELALU force — user menekannya justru karena
  //    angkanya terasa salah. Cache apa pun harus dibuang.
  clearIgCache();

  const before = { views: posting.views, likes: posting.likes, comments: posting.comments };

  const out = await syncPosting(posting.post_url, {
    force: true,
    mediaId: posting.provider_media_id,
  });

  const patch = buildPostingPatch(out, posting);

  const { data, error } = await supabaseAdmin
    .from("cc_postings")
    .update(patch)
    .eq("id", postingId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const changed =
    data.views !== before.views ||
    data.likes !== before.likes ||
    data.comments !== before.comments;

  return NextResponse.json({
    success: true,
    posting: data,
    synced: out.status === "OK",
    partial: out.status === "PARTIAL",
    changed,
    message: out.error,
  });
}