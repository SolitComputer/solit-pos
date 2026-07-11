// src/app/api/cc-reports/[id]/postings/[postingId]/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { syncPosting } from "@/lib/ccSync";

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

  const out = await syncPosting(posting.post_url);

  // Metrik hanya ditimpa kalau sync sukses — kalau gagal, angka manual dibiarkan.
  const patch: Record<string, unknown> = {
    last_synced_at: new Date().toISOString(),
    sync_status: out.status,
    sync_error: out.error,
    external_id: out.externalId ?? posting.external_id,
  };
  if (out.status === "OK") {
    patch.views = out.views;
    patch.likes = out.likes;
    patch.comments = out.comments;
  }

  const { data, error } = await supabaseAdmin
    .from("cc_postings")
    .update(patch)
    .eq("id", postingId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    posting: data,
    synced: out.status === "OK",
    message: out.error,
  });
}