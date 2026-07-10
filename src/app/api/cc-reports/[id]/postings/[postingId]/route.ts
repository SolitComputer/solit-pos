import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";

export const dynamic = "force-dynamic";

const FIELDS = ["platform", "post_url", "posted_at", "views", "likes", "comments"] as const;

// PATCH — update statistik / link posting
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; postingId: string } }
) {
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
    .eq("id", params.postingId)
    .eq("report_id", params.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, posting: data });
}

// DELETE posting
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; postingId: string } }
) {
  const { error } = await supabaseAdmin
    .from("cc_postings")
    .delete()
    .eq("id", params.postingId)
    .eq("report_id", params.id);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}