// src/app/api/cc-reports/[id]/postings/[postingId]/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { buildPostingPatch, syncPosting } from "@/lib/ccSync";

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

  const patch = buildPostingPatch(out, posting);

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
    partial: out.status === "PARTIAL",
    message: out.error,
  });
}