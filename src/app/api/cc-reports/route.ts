// src/app/api/cc-reports/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { computeStatus, type CCReport } from "@/lib/ccReports";

export const dynamic = "force-dynamic";

function attachStatus(r: CCReport): CCReport {
  return { ...r, status: computeStatus(r) };
}

// GET /api/cc-reports — list semua konten + postings + status
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("cc_reports")
    .select("*, postings:cc_postings(*)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  const reports = (data ?? []).map((r) => attachStatus(r as CCReport));
  return NextResponse.json({ success: true, reports });
}

// POST /api/cc-reports — buat konten baru (cukup judul)
export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  const userName = req.headers.get("x-user-name");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body tidak valid" }, { status: 400 });
  }

  const title = String(body?.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ success: false, error: "Judul konten wajib diisi" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("cc_reports")
    .insert({ title, created_by: userId, created_by_name: userName })
    .select("*, postings:cc_postings(*)")
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, report: attachStatus(data as CCReport) }, { status: 201 });
}