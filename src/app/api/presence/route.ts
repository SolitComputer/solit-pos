// src/app/api/presence/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── POST: Heartbeat dari client ──────────────────────────────────────────────
// Dipanggil setiap ~30 detik oleh usePresence hook
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const page = (body.page as string) || "/";

    const { error } = await supabase
      .from("user_presence")
      .upsert(
        {
          user_id:      user.id,
          user_name:    user.name,
          user_role:    user.role,
          current_page: page,
          last_seen:    new Date().toISOString(),
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

// ─── GET: Ambil semua user + merge dengan presence data (admin only) ─────────
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    const FULL_ACCESS = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];
    if (!FULL_ACCESS.includes(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    // ✅ FIX: Ambil SEMUA user dari tabel users (bukan hanya yang ada di presence)
    // Fetch parallel: semua users + semua presence data
    const [usersResult, presenceResult] = await Promise.all([
      supabase
        .from("users")
        .select("id, name, role")
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
    const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 menit

    // Buat map presence: user_id → presence record
    const presenceMap = new Map<string, { current_page: string; last_seen: string }>();
    for (const p of presenceResult.data ?? []) {
      presenceMap.set(p.user_id, {
        current_page: p.current_page,
        last_seen: p.last_seen,
      });
    }

    // ✅ Merge: setiap user pasti masuk, presence optional
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
        user_id:      u.id,
        user_name:    u.name,
        user_role:    u.role,
        current_page: presence?.current_page ?? null,
        last_seen,
        is_online,
        seconds_ago,
      };
    });

    return NextResponse.json({ success: true, data: merged });
  } catch (err: any) {
    console.error("[presence GET] exception:", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

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