// src/app/api/presence/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Sinkron dengan HEARTBEAT_INTERVAL_MS (15s) di usePresence.ts
// 35 detik = 15s interval + toleransi jaringan lambat ~20s
const ONLINE_THRESHOLD_MS = 35 * 1000;

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
      await supabase
        .from("user_presence")
        .delete()
        .eq("user_id", user.id);
      return NextResponse.json({ success: true });
    }

    const page = typeof body.page === "string" ? body.page : "/";

    const { error } = await supabase
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

    const [usersResult, presenceResult] = await Promise.all([
      supabase
        .from("users")
        .select("id, name, role, profile_photo_url")
        .order("name"),
      supabase
        .from("user_presence")
        .select("user_id, current_page, last_seen"),
    ]);

    if (usersResult.error) {
      console.error("[presence GET] users error:", usersResult.error.message);
      return NextResponse.json({ success: false }, { status: 500 });
    }

    const now = Date.now();

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
      const seconds_ago = last_seen
        ? Math.floor((now - new Date(last_seen).getTime()) / 1000)
        : null;
      const is_online = last_seen
        ? now - new Date(last_seen).getTime() < ONLINE_THRESHOLD_MS
        : false;

      return {
        user_id: u.id,
        user_name: u.name,
        user_role: u.role,
        current_page: presence?.current_page ?? null,
        last_seen,
        is_online,
        seconds_ago,
        profile_photo_url: u.profile_photo_url ?? null,
      };
    });

    return NextResponse.json({ success: true, data: merged });
  } catch (err: any) {
    console.error("[presence GET] exception:", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// ─── DELETE: Manual clear (fallback jika sendBeacon tidak tersedia) ───────────
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: true });

    await supabase
      .from("user_presence")
      .delete()
      .eq("user_id", user.id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}