import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
  // 1. Ambil semua patch note beserta siapa saja yang sudah membaca (semua user, bukan cuma diri sendiri)
  const { data: notes, error } = await supabaseAdmin
    .from("patch_notes")
    .select(
      "id, title, description, category, target_roles, created_at, reads:patch_note_reads(read_at, user_id)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[patch-notes/my GET]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const userRoles = user.roles ?? [];

  // 2. Filter di JS: (a) note ini nyasar ke role user ini (atau target_roles kosong = semua role)
  //                  (b) user ini belum pernah baca note ini
  const unread = (notes ?? []).filter((note) => {
    const targetRoles: string[] = note.target_roles ?? [];
    const isTargeted = targetRoles.length === 0 || targetRoles.some((r) => userRoles.includes(r));
    if (!isTargeted) return false;

    const reads = (note.reads ?? []) as { read_at: string; user_id: string }[];
    const alreadyRead = reads.some((r) => r.user_id === user.id);
    return !alreadyRead;
  });

  // 3. Buang field "reads" (siapa aja yg baca) sebelum dikirim ke client — user biasa nggak perlu tau itu
  const cleaned = unread.map(({ reads, ...rest }) => rest);

  return NextResponse.json({ success: true, data: cleaned });
}

export const GET = withAuth(getHandler);