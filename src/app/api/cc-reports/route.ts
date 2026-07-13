// src/app/api/cc-reports/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import {
  computeStatus, normalizeBrand, isCCBrand,
  type CCReport, type CCStatus,
} from "@/lib/ccReports";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const SELECT = "*, postings:cc_postings(*)";

function attachStatus(r: CCReport): CCReport {
  return { ...r, status: computeStatus(r) };
}

type Q = ReturnType<typeof supabaseAdmin.from> extends never ? never : any;

/**
 * Filter status di SQL — mengikuti urutan computeStatus() persis:
 * posting_done → posting_count → edit_done → take_done
 * Ini yang bikin pagination tetap benar walau data ribuan.
 */
function applyStatusFilter(q: Q, status: CCStatus): Q {
  switch (status) {
    case "SELESAI":
      return q.eq("posting_done", true);
    case "POSTED":
      return q.eq("posting_done", false).gt("posting_count", 0);
    case "SIAP_POSTING":
      return q.eq("posting_done", false).eq("posting_count", 0).eq("edit_done", true);
    case "PROSES":
      return q.eq("posting_done", false).eq("posting_count", 0)
        .eq("edit_done", false).eq("take_done", true);
    case "BELUM_SELESAI":
      return q.eq("posting_done", false).eq("posting_count", 0)
        .eq("edit_done", false).eq("take_done", false);
  }
}

const STATUSES: CCStatus[] = ["BELUM_SELESAI", "PROSES", "SIAP_POSTING", "POSTED", "SELESAI"];

// GET /api/cc-reports?brand=&status=&q=&page=1&limit=20
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const brand = sp.get("brand");
  const statusRaw = sp.get("status");
  const search = (sp.get("q") ?? "").trim();
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(sp.get("limit")) || DEFAULT_LIMIT));

  let q = supabaseAdmin
    .from("cc_reports")
    .select(SELECT, { count: "exact" })
    .order("created_at", { ascending: false });

  if (isCCBrand(brand)) q = q.eq("brand", brand);

  if (statusRaw && STATUSES.includes(statusRaw as CCStatus)) {
    q = applyStatusFilter(q, statusRaw as CCStatus);
  }

  if (search) {
    // escape wildcard supaya "%" di judul tidak jadi operator
    const safe = search.replace(/[%_]/g, (m) => `\\${m}`);
    q = q.ilike("title", `%${safe}%`);
  }

  const from = (page - 1) * limit;
  const { data, error, count } = await q.range(from, from + limit - 1);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const total = count ?? 0;
  return NextResponse.json({
    success: true,
    reports: (data ?? []).map((r) => attachStatus(r as CCReport)),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}

// POST /api/cc-reports — buat konten baru (judul + brand)
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

  const brand = normalizeBrand(body?.brand);

  const { data, error } = await supabaseAdmin
    .from("cc_reports")
    .insert({ title, brand, created_by: userId, created_by_name: userName })
    .select(SELECT)
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, report: attachStatus(data as CCReport) }, { status: 201 });
}