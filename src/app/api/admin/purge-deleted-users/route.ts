import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";

// ── Helper hapus foto profil — sama seperti yang dulu ada di deleteHandler,
// sekarang baru dipakai lagi di sini karena ini titik "hapus permanen" yang
// sebenarnya (dulu di-skip dari soft delete supaya avatar tetap ada kalau direstore).
const AVATAR_BUCKET = "avatars";
function extractAvatarPath(publicUrl: string): string | null {
  const marker = `/${AVATAR_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  return idx === -1 ? null : publicUrl.slice(idx + marker.length);
}

const PURGE_AFTER_DAYS = 21;

// Endpoint ini dipanggil oleh cron server (curl), bukan oleh user di browser —
// jadi tidak lewat withAuth (tidak ada cookie token), melainkan dicek pakai
// secret header sendiri.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: dueForPurge, error: fetchError } = await supabaseAdmin
    .from("users")
    .select("id, name, profile_photo_url")
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);

  if (fetchError) {
    return NextResponse.json({ success: false, message: fetchError.message }, { status: 500 });
  }
  if (!dueForPurge || dueForPurge.length === 0) {
    return NextResponse.json({ success: true, purged: 0 });
  }

  const ids = dueForPurge.map((u) => u.id);

  const { error: deleteError } = await supabaseAdmin.from("users").delete().in("id", ids);
  if (deleteError) {
    return NextResponse.json({ success: false, message: deleteError.message }, { status: 500 });
  }

  // Baru di titik INI foto profil beneran dihapus permanen dari storage.
  for (const u of dueForPurge) {
    const path = u.profile_photo_url ? extractAvatarPath(u.profile_photo_url) : null;
    if (path) {
      await supabaseAdmin.storage.from(AVATAR_BUCKET).remove([path]).catch(() => {});
    }
  }

  return NextResponse.json({
    success: true,
    purged: dueForPurge.length,
    names: dueForPurge.map((u) => u.name),
  });
}