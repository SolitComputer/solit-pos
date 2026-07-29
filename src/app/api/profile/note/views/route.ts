import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── GET — daftar orang yang sudah melihat catatan/lagu kita — hanya bisa diakses pemiliknya sendiri ──
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const { searchParams } = new URL(req.url);
  const ownerId = searchParams.get("ownerId");

  if (!ownerId) {
    return NextResponse.json({ success: false, message: "ownerId wajib diisi" }, { status: 400 });
  }
  if (ownerId !== user.id) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("note_views")
    .select("viewer_id, viewed_at, users!note_views_viewer_id_fkey (id, name, profile_photo_url)")
    .eq("owner_id", ownerId)
    .order("viewed_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const viewers = (data ?? []).map((row: any) => ({
    id: row.users?.id ?? row.viewer_id,
    name: row.users?.name ?? "Unknown",
    profile_photo_url: row.users?.profile_photo_url ?? null,
    viewed_at: row.viewed_at,
  }));

  return NextResponse.json({ success: true, data: viewers });
}

// ── POST — catat bahwa user yang login sudah melihat catatan/lagu milik owner_id ──
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const body = await req.json().catch(() => ({}));
  const ownerId = body.owner_id as string | undefined;

  if (!ownerId) {
    return NextResponse.json({ success: false, message: "owner_id wajib diisi" }, { status: 400 });
  }

  // Tidak perlu catat kalau lihat catatan sendiri
  if (ownerId === user.id) {
    return NextResponse.json({ success: true, skipped: true });
  }

  const { error } = await supabase
    .from("note_views")
    .upsert(
      { owner_id: ownerId, viewer_id: user.id, viewed_at: new Date().toISOString() },
      { onConflict: "owner_id,viewer_id" }
    );

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);