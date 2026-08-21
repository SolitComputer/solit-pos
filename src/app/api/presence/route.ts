// src/app/api/presence/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

// Sinkron dengan HEARTBEAT_INTERVAL_MS (45s) di usePresence.ts
// 90 detik = 45s interval + toleransi jaringan lambat ~45s
const ONLINE_THRESHOLD_MS = 90 * 1000;

// Short-lived in-memory cache to prevent Supabase connection pileup when multiple clients query simultaneously
let cachedPresence: { data: any[]; timestamp: number } | null = null;
let presenceInflight: Promise<any[]> | null = null;
const CACHE_TTL_MS = 3_000; // 3 detik TTL

async function getCachedOrFetchPresence(): Promise<any[]> {
  const now = Date.now();
  if (cachedPresence && now - cachedPresence.timestamp < CACHE_TTL_MS) {
    return cachedPresence.data;
  }
  if (presenceInflight) {
    return presenceInflight;
  }

  presenceInflight = (async () => {
    try {
      const [usersResult, presenceResult] = await Promise.all([
        supabaseAdmin
          .from("users")
          .select("id, name, role, profile_photo_url")
          .order("name"),
        supabaseAdmin
          .from("user_presence")
          .select("user_id, current_page, last_seen"),
      ]);

      if (usersResult.error) {
        throw new Error(usersResult.error.message);
      }

      const presenceMap = new Map<string, { current_page: string; last_seen: string }>();
      for (const p of presenceResult.data ?? []) {
        presenceMap.set(p.user_id, {
          current_page: p.current_page,
          last_seen: p.last_seen,
        });
      }

      const merged = (usersResult.data ?? []).map((u: any) => {
        const presence = presenceMap.get(u.id);
        const last_seen = presence?.last_seen ?? null;
        return {
          user_id: u.id,
          user_name: u.name,
          user_role: u.role,
          current_page: presence?.current_page ?? null,
          last_seen,
          profile_photo_url: u.profile_photo_url ?? null,
        };
      });

      cachedPresence = { data: merged, timestamp: Date.now() };
      return merged;
    } finally {
      presenceInflight = null;
    }
  })();

  return presenceInflight;
}

// ─── POST: Heartbeat dari client ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    // Baca body — bisa gagal jika sendBeacon kirim kosong
    let body: any = {};
    try {
      const text = await request.text();
      if (text) body = JSON.parse(text);
    } catch { /* abaikan parse error */ }

    // Handle _clear signal dari sendBeacon saat tab/window ditutup
    if (body._clear === true) {
      await supabaseAdmin
        .from("user_presence")
        .delete()
        .eq("user_id", user.id);
      cachedPresence = null; // bust cache
      return NextResponse.json({ success: true });
    }

    const page = typeof body.page === "string" ? body.page : "/";

    const { error } = await supabaseAdmin
      .from("user_presence")
      .upsert(
        {
          user_id: user.id,
          user_name: user.name,
          user_role: user.role,
          current_page: page,
          last_seen: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("[presence POST] upsert error:", error.message);
      return NextResponse.json({ success: false }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[presence POST] exception:", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// ─── GET: Ambil semua user + merge dengan presence data ──────────────────────
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    const merged = await getCachedOrFetchPresence();
    const now = Date.now();

    const data = merged.map((u: any) => {
      const last_seen = u.last_seen ?? null;
      const seconds_ago = last_seen
        ? Math.floor((now - new Date(last_seen).getTime()) / 1000)
        : null;
      const is_online = last_seen
        ? now - new Date(last_seen).getTime() < ONLINE_THRESHOLD_MS
        : false;

      return {
        ...u,
        is_online,
        seconds_ago,
      };
    });

    const res = NextResponse.json({ success: true, data });
    res.headers.set("Cache-Control", "private, no-cache");
    return res;
  } catch (err: any) {
    console.error("[presence GET] exception:", err);
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

// ─── DELETE: Manual clear (fallback jika sendBeacon tidak tersedia) ───────────
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: true });

    await supabaseAdmin
      .from("user_presence")
      .delete()
      .eq("user_id", user.id);

    cachedPresence = null;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}