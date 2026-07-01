import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { isMissionFullAccess } from "@/lib/missions";

const SELECT = `
  id, title, description, status, priority, due_date,
  proof_photo_url, proof_note, submitted_at, reviewed_at,
  rejection_reason, created_at, updated_at,
  assigned_by, assigned_to,
  assigner:users!missions_assigned_by_fkey(id, name, role, roles),
  assignee:users!missions_assigned_to_fkey(id, name, role, roles),
  reviewer:users!missions_reviewed_by_fkey(id, name),
  items:mission_items(id, mission_id, text, is_done, done_at, sort_order)
`;

async function patchHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { id } = await ctx.params;
  const roles = user.roles ?? [user.role];
  const badReq = (m: string) => NextResponse.json({ success: false, message: m }, { status: 400 });

  let body: any;
  try { body = await req.json(); }
  catch { return badReq("Body tidak valid"); }

  const { item_id, is_done } = body;
  if (!item_id) return badReq("item_id wajib");

  const { data: mission, error: mErr } = await supabaseAdmin
    .from("missions").select("id, assigned_to, status").eq("id", id).maybeSingle();
  if (mErr) return NextResponse.json({ success: false, message: mErr.message }, { status: 500 });
  if (!mission) return NextResponse.json({ success: false, message: "Misi tidak ditemukan" }, { status: 404 });

  const isAssignee = mission.assigned_to === user.id;
  if (!isAssignee && !isMissionFullAccess(roles))
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  if (mission.status === "APPROVED")
    return badReq("Misi sudah disetujui, checklist terkunci");

  const done = !!is_done;
  const { error: upErr } = await supabaseAdmin
    .from("mission_items")
    .update({ is_done: done, done_at: done ? new Date().toISOString() : null })
    .eq("id", item_id)
    .eq("mission_id", id); 

  if (upErr) return NextResponse.json({ success: false, message: upErr.message }, { status: 500 });

  if (done && mission.status === "PENDING") {
    await supabaseAdmin.from("missions").update({ status: "IN_PROGRESS" }).eq("id", id);
  }

  const { data, error } = await supabaseAdmin.from("missions").select(SELECT).eq("id", id).single();
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

export const PATCH = withAuth(patchHandler);