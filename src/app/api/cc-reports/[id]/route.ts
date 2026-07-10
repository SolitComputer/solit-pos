// src/app/api/cc-reports/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { computeStatus, type CCReport } from "@/lib/ccReports";
import { hasAnyRole } from "@/lib/permissions";
import { CC_REPORT_MANAGE_ROLES } from "@/lib/permissions";
import type { UserRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Field yang boleh di-update via PATCH (whitelist — hindari mass assignment)
const TAKE_FIELDS = [
  "videographer", "talent", "location", "equipment",
  "take_start", "take_end", "take_received_editor", "take_done",
] as const;
const EDIT_FIELDS = [
  "editor_name", "editor_work", "edit_start", "edit_end",
  "ready_folder_link", "edit_done",
] as const;
const ALLOWED = new Set<string>([...TAKE_FIELDS, ...EDIT_FIELDS, "title"]);

// GET satu konten
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabaseAdmin
    .from("cc_reports")
    .select("*, postings:cc_postings(*)")
    .eq("id", params.id)
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 404 });
  }
  return NextResponse.json({ success: true, report: { ...(data as CCReport), status: computeStatus(data as CCReport) } });
}

// PATCH — update section take / edit / judul
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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
    return NextResponse.json({ success: false, error: "Tidak ada field yang diupdate" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("cc_reports")
    .update(patch)
    .eq("id", params.id)
    .select("*, postings:cc_postings(*)")
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, report: { ...(data as CCReport), status: computeStatus(data as CCReport) } });
}

// DELETE — hanya head + full access (postings ikut kehapus via ON DELETE CASCADE)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const roles = (req.headers.get("x-user-roles") ?? "").split(",").filter(Boolean);
  if (!hasAnyRole(roles, CC_REPORT_MANAGE_ROLES as UserRole[])) {
    return NextResponse.json({ success: false, error: "Tidak punya izin menghapus" }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from("cc_reports").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}