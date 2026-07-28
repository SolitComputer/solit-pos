// src/app/api/patch-notes/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { PATCH_NOTES_PUBLISH_ROLES, VALID_PATCH_NOTE_CATEGORIES } from "@/lib/patchNotes";

interface Props {
  params: Promise<{ id: string }>;
}

async function patchHandler(req: NextRequest, props: Props, _user: AuthUser) {
  const { id } = await props.params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 });
  }

  const { title, description, category, target_roles } = body;

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (title !== undefined) {
    if (!title.trim()) {
      return NextResponse.json({ success: false, message: "Judul tidak boleh kosong" }, { status: 400 });
    }
    updates.title = title.trim();
  }

  if (description !== undefined) {
    if (!description.trim()) {
      return NextResponse.json({ success: false, message: "Deskripsi tidak boleh kosong" }, { status: 400 });
    }
    updates.description = description.trim();
  }

  if (category !== undefined) {
    if (!VALID_PATCH_NOTE_CATEGORIES.includes(category)) {
      return NextResponse.json({ success: false, message: "Kategori tidak valid" }, { status: 400 });
    }
    updates.category = category;
  }

  if (target_roles !== undefined) {
    if (!Array.isArray(target_roles)) {
      return NextResponse.json({ success: false, message: "target_roles harus array" }, { status: 400 });
    }
    updates.target_roles = target_roles;
  }

  const { error } = await supabaseAdmin
    .from("patch_notes")
    .update(updates)
    .eq("id", id);

  if (error) {
    console.error("[patch-notes/[id] PATCH]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

async function deleteHandler(_req: NextRequest, props: Props, _user: AuthUser) {
  const { id } = await props.params;

  // 1. Delete associated reads first
  await supabaseAdmin.from("patch_note_reads").delete().eq("patch_note_id", id);

  // 2. Delete patch note
  const { error } = await supabaseAdmin.from("patch_notes").delete().eq("id", id);

  if (error) {
    console.error("[patch-notes/[id] DELETE]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export const PATCH = withAuth(patchHandler, PATCH_NOTES_PUBLISH_ROLES);
export const PUT = withAuth(patchHandler, PATCH_NOTES_PUBLISH_ROLES);
export const DELETE = withAuth(deleteHandler, PATCH_NOTES_PUBLISH_ROLES);
