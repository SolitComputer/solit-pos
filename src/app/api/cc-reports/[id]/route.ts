import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { computeStatus, isCCBrand, type CCReport } from "@/lib/ccReports";
import { hasAnyRole, CC_REPORT_MANAGE_ROLES } from "@/lib/permissions";
import type { UserRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TAKE_FIELDS = [
  "videographer", "talent", "location", "equipment", "device",
  "take_start", "take_end", "take_received_editor", "take_done",
] as const;
const EDIT_FIELDS = [
  "editor_name", "editor_work", "edit_start", "edit_end",
  "ready_folder_link", "edit_done",
] as const;
const POSTING_FIELDS = ["posting_done"] as const;

const ALLOWED = new Set<string>([
  ...TAKE_FIELDS,
  ...EDIT_FIELDS,
  ...POSTING_FIELDS,
  "title",
  "brand",
  "needs_revision",
  "is_cancelled",
]);

// GET satu konten
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("cc_reports")
    .select("*, postings:cc_postings(*)")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    report: { ...(data as CCReport), status: computeStatus(data as CCReport) },
  });
}

export async function PATCH(
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

  const patch: Record<string, any> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (ALLOWED.has(k)) patch[k] = v === "" ? null : v;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { success: false, error: "Tidak ada field yang diupdate" },
      { status: 400 }
    );
  }

  if ("posting_done" in patch) {
    patch.posting_done_at = patch.posting_done ? new Date().toISOString() : null;
  }

  if ("brand" in patch && !isCCBrand(patch.brand)) {
    return NextResponse.json(
      { success: false, error: "Brand tidak valid" },
      { status: 400 }
    );
  }

  if (patch.needs_revision === true) {
    const { data: cur, error: curErr } = await supabaseAdmin
      .from("cc_reports")
      .select("edit_done")
      .eq("id", id)
      .single();

    if (curErr || !cur) {
      return NextResponse.json({ success: false, error: "Konten tidak ditemukan" }, { status: 404 });
    }
    if (!cur.edit_done) {
      return NextResponse.json(
        { success: false, error: "Tahap Editing belum pernah selesai — revisi belum bisa ditandai" },
        { status: 400 }
      );
    }
  }

  if (patch.posting_done === true) {
    const { data: cur, error: curErr } = await supabaseAdmin
      .from("cc_reports")
      .select("edit_done, postings:cc_postings(id)")
      .eq("id", id)
      .single();

    if (curErr || !cur) {
      return NextResponse.json(
        { success: false, error: "Konten tidak ditemukan" },
        { status: 404 }
      );
    }
    if (!cur.edit_done) {
      return NextResponse.json(
        { success: false, error: "Tahap Editing belum selesai" },
        { status: 400 }
      );
    }
    if ((cur.postings?.length ?? 0) === 0) {
      return NextResponse.json(
        { success: false, error: "Belum ada posting — tambahkan minimal satu platform" },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from("cc_reports")
    .update(patch)
    .eq("id", id)
    .select("*, postings:cc_postings(*)")
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    report: { ...(data as CCReport), status: computeStatus(data as CCReport) },
  });
}

// DELETE — hanya head + full access (postings ikut kehapus via ON DELETE CASCADE)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const roles = (req.headers.get("x-user-roles") ?? "").split(",").filter(Boolean);
  if (!hasAnyRole(roles, CC_REPORT_MANAGE_ROLES as UserRole[])) {
    return NextResponse.json({ success: false, error: "Tidak punya izin menghapus" }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from("cc_reports").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}