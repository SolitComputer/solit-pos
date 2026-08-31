import { supabaseAdmin } from "@/services/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";
import { parsePostUrl } from "@/lib/ccMetrics";
import { syncPosting } from "@/lib/ccSync";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("cc_postings")
    .select("*")
    .eq("report_id", id)
    .order("posted_at", { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, postings: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body tidak valid" }, { status: 400 });
  }

  const postUrl =
    typeof body?.post_url === "string" ? body.post_url.trim() || null : null;

  const parsed = postUrl ? parsePostUrl(postUrl) : null;
  const platform = String(body?.platform ?? parsed?.platform ?? "").trim();

  if (!platform) {
    return NextResponse.json({ success: false, error: "Platform wajib dipilih" }, { status: 400 });
  }

  const out = postUrl ? await syncPosting(postUrl, { force: true }) : null;
  const gotMetrics = out?.status === "OK" || out?.status === "PARTIAL";
  const manual = (v: unknown) => Number(v) || 0;

  const currentUser = await getCurrentUser();

  const { data, error } = await supabaseAdmin
    .from("cc_postings")
    .insert({
      report_id: id,
      platform,
      post_url: postUrl,
      posted_at: body?.posted_at || null,
      external_id: out?.externalId ?? parsed?.externalId ?? null,
      provider_media_id: out?.providerMediaId ?? null,
      views: gotMetrics && out!.views !== null ? out!.views : manual(body?.views),
      likes: gotMetrics && out!.likes !== null ? out!.likes : manual(body?.likes),
      comments: gotMetrics && out!.comments !== null ? out!.comments : manual(body?.comments),
      sync_status: out?.status ?? "PENDING",
      sync_error: out?.error ?? null,
      last_synced_at: out ? new Date().toISOString() : null,
      created_by: currentUser?.id ?? null,
      created_by_name: currentUser?.name ?? null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json(
    {
      success: true,
      posting: data,
      synced: out?.status === "OK",
      message: out?.error ?? null,
    },
    { status: 201 }
  );
}