// src/app/api/cc-reports/[id]/postings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";

export const dynamic = "force-dynamic";

// GET postings satu konten
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabaseAdmin
    .from("cc_postings")
    .select("*")
    .eq("report_id", params.id)
    .order("posted_at", { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, postings: data ?? [] });
}

// POST — tambah posting platform baru
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body tidak valid" }, { status: 400 });
  }

  const platform = String(body?.platform ?? "").trim();
  if (!platform) {
    return NextResponse.json({ success: false, error: "Platform wajib dipilih" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("cc_postings")
    .insert({
      report_id: params.id,
      platform,
      post_url: body?.post_url?.trim() || null,
      posted_at: body?.posted_at || null,
      views: Number(body?.views) || 0,
      likes: Number(body?.likes) || 0,
      comments: Number(body?.comments) || 0,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, posting: data }, { status: 201 });
}