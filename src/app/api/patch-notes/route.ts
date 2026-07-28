// src/app/api/patch-notes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { PATCH_NOTES_PUBLISH_ROLES, VALID_PATCH_NOTE_CATEGORIES } from "@/lib/patchNotes";

async function getHandler(_req: NextRequest, _ctx: any, _user: AuthUser) {
  const { data, error } = await supabaseAdmin
    .from("patch_notes")
    .select(
      "id, title, description, category, target_roles, created_by, created_at, updated_at, author:users!patch_notes_created_by_fkey(id, name), reads:patch_note_reads(read_at, user:users(id, name, role))"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[patch-notes GET]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: data ?? [] });
}

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 }); }

  const { title, description, category, target_roles } = body;

  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json({ success: false, message: "Judul & deskripsi wajib diisi" }, { status: 400 });
  }
  if (!VALID_PATCH_NOTE_CATEGORIES.includes(category)) {
    return NextResponse.json({ success: false, message: "Kategori tidak valid" }, { status: 400 });
  }
  if (target_roles !== undefined && !Array.isArray(target_roles)) {
    return NextResponse.json({ success: false, message: "target_roles harus array" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("patch_notes")
    .insert({
      title: title.trim(),
      description: description.trim(),
      category,
      target_roles: Array.isArray(target_roles) ? target_roles : [],
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[patch-notes POST]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data.id });
}

export const GET = withAuth(getHandler, PATCH_NOTES_PUBLISH_ROLES);
export const POST = withAuth(postHandler, PATCH_NOTES_PUBLISH_ROLES);
