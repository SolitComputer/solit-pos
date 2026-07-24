// src/app/api/patch-notes/mark-read/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 }); }

  const { patch_note_id } = body;
  if (!patch_note_id) {
    return NextResponse.json({ success: false, message: "patch_note_id wajib diisi" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("patch_note_reads")
    .upsert(
      { patch_note_id, user_id: user.id },
      { onConflict: "patch_note_id,user_id", ignoreDuplicates: true }
    );

  if (error) {
    console.error("[patch-notes/mark-read]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export const POST = withAuth(postHandler);
