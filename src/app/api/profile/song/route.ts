import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── GET — cari lagu lewat iTunes Search API (publik, gratis, tanpa API key) ─
async function getHandler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ success: true, data: [] });
  }

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=8`;
    const res = await fetch(url);
    const json = await res.json();

    const results = (json.results ?? []).map((r: any) => ({
      trackId: r.trackId,
      trackName: r.trackName,
      artistName: r.artistName,
      // Artwork default iTunes 100x100 — perbesar ke 300x300 biar tidak pecah
      artworkUrl: r.artworkUrl100 ? r.artworkUrl100.replace("100x100", "300x300") : null,
      previewUrl: r.previewUrl ?? null,
    }));

    return NextResponse.json({ success: true, data: results });
  } catch (err: any) {
    console.error("[profile/song GET] iTunes search error:", err);
    return NextResponse.json({ success: false, message: "Gagal mencari lagu" }, { status: 500 });
  }
}

// ── POST — simpan lagu terpilih ke profil ────────────────────────────────────
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const body = await req.json().catch(() => ({}));
  const { title, artist, artwork_url, preview_url } = body;

  if (!title || !artist) {
    return NextResponse.json({ success: false, message: "Judul dan artis wajib diisi" }, { status: 400 });
  }

  const { error } = await supabase
    .from("users")
    .update({
      song_title: title,
      song_artist: artist,
      song_artwork_url: artwork_url ?? null,
      song_preview_url: preview_url ?? null,
      song_updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

// ── DELETE — hapus lagu dari profil ──────────────────────────────────────────
async function deleteHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const { error } = await supabase
    .from("users")
    .update({
      song_title: null,
      song_artist: null,
      song_artwork_url: null,
      song_preview_url: null,
      song_updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);