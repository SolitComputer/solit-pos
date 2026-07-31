import { SupabaseClient } from "@supabase/supabase-js";

export interface ExpirableUserRow {
  id: string;
  status_note_expires_at?: string | null;
  song_expires_at?: string | null;
}

interface ExpiryResult {
  noteExpired: boolean;
  songExpired: boolean;
}

// Catatan/lagu bergaya Instagram Notes cuma hidup 24 jam. Endpoint GET yang
// mengembalikan data ini bertugas jadi "cleanup on read" — begitu ketahuan
// sudah lewat, kolomnya beneran di-null-in di database (bukan cuma
// disembunyikan di response), sama persis seperti alur DELETE manual.
export async function clearExpiredStoryFields(
  supabase: SupabaseClient,
  row: ExpirableUserRow
): Promise<ExpiryResult> {
  const now = new Date();
  const noteExpired = !!row.status_note_expires_at && new Date(row.status_note_expires_at) < now;
  const songExpired = !!row.song_expires_at && new Date(row.song_expires_at) < now;

  if (!noteExpired && !songExpired) {
    return { noteExpired: false, songExpired: false };
  }

  const updates: Record<string, unknown> = {};
  if (noteExpired) {
    updates.status_note = null;
    updates.status_note_expires_at = null;
  }
  if (songExpired) {
    updates.song_title = null;
    updates.song_artist = null;
    updates.song_artwork_url = null;
    updates.song_preview_url = null;
    updates.song_clip_start = 0;
    updates.song_expires_at = null;
  }

  await supabase.from("users").update(updates).eq("id", row.id);

  // Catatan baru menghapus "dilihat oleh"-nya sendiri — samakan behavior
  // saat catatan kadaluarsa otomatis. Lagu tidak menyentuh note_views
  // (sama seperti DELETE /api/profile/song yang sudah ada).
  if (noteExpired) {
    await supabase.from("note_views").delete().eq("owner_id", row.id);
  }

  return { noteExpired, songExpired };
}
