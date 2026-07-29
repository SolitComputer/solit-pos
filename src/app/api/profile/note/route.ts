import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_NOTE_LENGTH = 60;
const NOTE_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 jam — gaya Instagram Notes

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const body = await req.json().catch(() => ({}));
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!note) {
    return NextResponse.json({ success: false, message: "Catatan tidak boleh kosong" }, { status: 400 });
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return NextResponse.json({ success: false, message: `Catatan maksimal ${MAX_NOTE_LENGTH} karakter` }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + NOTE_LIFETIME_MS).toISOString();

  const { error } = await supabase
    .from("users")
    .update({ status_note: note, status_note_expires_at: expiresAt })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  // Catatan baru dibuat — reset daftar "dilihat oleh" dari catatan sebelumnya
  await supabase.from("note_views").delete().eq("owner_id", user.id);

  return NextResponse.json({ success: true, data: { expires_at: expiresAt } });
}

async function deleteHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const { error } = await supabase
    .from("users")
    .update({ status_note: null, status_note_expires_at: null })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  await supabase.from("note_views").delete().eq("owner_id", user.id);

  return NextResponse.json({ success: true });
}

export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);