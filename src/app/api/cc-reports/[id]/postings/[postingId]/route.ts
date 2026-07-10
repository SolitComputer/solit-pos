// src/app/api/cc-reports/[id]/postings/[postingId]/route.ts
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Field yang boleh di-update via PATCH posting (whitelist)
const FIELDS = ["platform", "post_url", "posted_at", "views", "likes", "comments"] as const;

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

  const { data, error } = await supabaseAdmin
    .from("cc_postings")
    .update(patch)
    .eq("id", postingId)
    .eq("report_id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, posting: data });
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