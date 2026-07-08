// src/app/api/missions/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { canReviewMission, isMissionFullAccess } from "@/lib/missions";

const SELECT = `
  id, title, description, status, priority, due_date,
  proof_photo_url, proof_note, submitted_at, reviewed_at,
  rejection_reason, created_at, updated_at,
  assigned_by, assigned_to,
  assigner:users!missions_assigned_by_fkey(id, name, role, roles),
  assignee:users!missions_assigned_to_fkey(id, name, role, roles),
  reviewer:users!missions_reviewed_by_fkey(id, name)
`;

// ── GET — detail misi ────────────────────────────────────────────────────────
async function getHandler(_req: NextRequest, ctx: any, user: AuthUser) {
  const { id } = await ctx.params;
  const roles = user.roles ?? [user.role];

  const { data, error } = await supabaseAdmin
    .from("missions").select(SELECT).eq("id", id).maybeSingle();

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ success: false, message: "Misi tidak ditemukan" }, { status: 404 });

  const allowed =
    isMissionFullAccess(roles) ||
    data.assigned_to === user.id ||
    data.assigned_by === user.id;
  if (!allowed) return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });

  return NextResponse.json({ success: true, data });
}

// ── PATCH — aksi: start | submit | approve | reject ──────────────────────────
async function patchHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { id } = await ctx.params;
  const roles = user.roles ?? [user.role];

  const forbidden = () => NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  const badReq = (m: string) => NextResponse.json({ success: false, message: m }, { status: 400 });

  let body: any;
  try { body = await req.json(); }
  catch { return badReq("Body tidak valid"); }
  const action = body.action as string;

  const { data: mission, error: fetchErr } = await supabaseAdmin
    .from("missions")
    .select("id, status, assigned_by, assigned_to")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ success: false, message: fetchErr.message }, { status: 500 });
  if (!mission) return NextResponse.json({ success: false, message: "Misi tidak ditemukan" }, { status: 404 });

  const isAssignee = mission.assigned_to === user.id;
  const canReview = canReviewMission({ id: user.id, roles }, mission);
  const updates: Record<string, any> = {};

  switch (action) {
    case "start": {
      if (!isAssignee) return forbidden();
      if (mission.status !== "PENDING") return badReq("Misi hanya bisa dimulai dari status Menunggu");
      updates.status = "IN_PROGRESS";
      break;
    }
    case "submit": {
      if (!isAssignee) return forbidden();
      if (!["PENDING", "IN_PROGRESS", "REJECTED"].includes(mission.status))
        return badReq("Misi tidak bisa disubmit dari status saat ini");

      const { data: items } = await supabaseAdmin
        .from("mission_items").select("is_done").eq("mission_id", id);
      if (items && items.length > 0 && items.some(it => !it.is_done)) {
        return badReq("Selesaikan semua sub-tugas dulu sebelum submit");
      }

      if (!body.proof_photo_url) return badReq("Bukti foto wajib diupload");
      updates.status = "SUBMITTED";
      updates.proof_photo_url = body.proof_photo_url;
      updates.proof_note = body.proof_note?.trim() || null;
      updates.submitted_at = new Date().toISOString();
      updates.rejection_reason = null;
      break;
    }
    case "approve": {
      if (!canReview) return forbidden();
      if (mission.status !== "SUBMITTED") return badReq("Hanya misi yang sudah disubmit bisa diaudit");
      updates.status = "APPROVED";
      updates.reviewed_by = user.id;
      updates.reviewed_at = new Date().toISOString();
      updates.rejection_reason = null;
      break;
    }
    case "reject": {
      if (!canReview) return forbidden();
      if (mission.status !== "SUBMITTED") return badReq("Hanya misi yang sudah disubmit bisa ditolak / direvisi");
      updates.status = "REJECTED";
      updates.reviewed_by = user.id;
      updates.reviewed_at = new Date().toISOString();
      updates.rejection_reason = body.rejection_reason?.trim() || "Tanpa alasan";
      break;
    }
    default:
      return badReq("Action tidak dikenali");
  }

  const { data, error } = await supabaseAdmin
    .from("missions").update(updates).eq("id", id).select(SELECT).single();

  if (error) {
    console.error("[missions PATCH]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data });
}

// ── DELETE — hapus misi (pemberi / full access) ──────────────────────────────
async function deleteHandler(_req: NextRequest, ctx: any, user: AuthUser) {
  const { id } = await ctx.params;
  const roles = user.roles ?? [user.role];

  const { data: mission, error: fetchErr } = await supabaseAdmin
    .from("missions")
    .select("assigned_by, assigned_to, status, title")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ success: false, message: fetchErr.message }, { status: 500 });
  if (!mission) return NextResponse.json({ success: false, message: "Misi tidak ditemukan" }, { status: 404 });

  // Hanya pemberi misi atau full access yang boleh hapus
  const canDelete = isMissionFullAccess(roles) || mission.assigned_by === user.id;
  if (!canDelete) {
    return NextResponse.json(
      { success: false, message: "Kamu tidak berwenang menghapus misi ini" },
      { status: 403 }
    );
  }

  // Guard: misi APPROVED = arsip, hanya full access yang boleh hapus
  if (mission.status === "APPROVED" && !isMissionFullAccess(roles)) {
    return NextResponse.json(
      { success: false, message: "Misi yang sudah disetujui menjadi arsip dan tidak bisa dihapus. Hubungi admin." },
      { status: 400 }
    );
  }

  // Hapus mission_items dulu (jaga-jaga kalau CASCADE belum di-set di DB)
  const { error: itemsErr } = await supabaseAdmin
    .from("mission_items").delete().eq("mission_id", id);
  if (itemsErr) {
    console.error("[missions DELETE items]", itemsErr);
    // Non-fatal — lanjut hapus mission, karena kalau CASCADE aktif error ini normal
  }

  const { error } = await supabaseAdmin.from("missions").delete().eq("id", id);
  if (error) {
    console.error("[missions DELETE]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Misi berhasil dihapus" });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);