// src/app/api/patch-notes/unread/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { isPatchNoteVisibleToUser } from "@/lib/patchNotes";

async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
  const roles = user.roles ?? [user.role];

  const { data: readRows, error: readErr } = await supabaseAdmin
    .from("patch_note_reads")
    .select("patch_note_id")
    .eq("user_id", user.id);

  if (readErr) {
    console.error("[patch-notes/unread reads]", readErr);
    return NextResponse.json({ success: false, message: readErr.message }, { status: 500 });
  }
  const readIds = new Set((readRows ?? []).map((r) => r.patch_note_id));

  const { data: notes, error: notesErr } = await supabaseAdmin
    .from("patch_notes")
    .select("id, title, description, category, target_roles, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (notesErr) {
    console.error("[patch-notes/unread list]", notesErr);
    return NextResponse.json({ success: false, message: notesErr.message }, { status: 500 });
  }

  const unread = (notes ?? [])
    .filter((n) => !readIds.has(n.id))
    .filter((n) => isPatchNoteVisibleToUser(n.target_roles ?? [], roles))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  return NextResponse.json({ success: true, data: unread, count: unread.length });
}

export const GET = withAuth(getHandler);
