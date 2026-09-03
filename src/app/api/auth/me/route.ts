import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { getJwtSecret } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import type { EquippedBorder } from "@/lib/solit-coins/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    const raw = jwt.verify(token, getJwtSecret()) as Record<string, any>;

    // ✅ Normalize roles: JWT lama hanya punya "role" string
    // JWT baru (setelah implementasi multi-role) punya "roles" array
    const roles: string[] =
      Array.isArray(raw.roles) && raw.roles.length > 0
        ? raw.roles
        : [raw.role].filter(Boolean);

    const [{ data: dbUser }, { data: eb }] = await Promise.all([
      supabase.from("users").select("profile_photo_url").eq("id", raw.id).maybeSingle(),
      supabase
        .from("user_equipped_border")
        .select("border_catalog!inner(id, code, name, tier, style)")
        .eq("user_id", raw.id)
        .maybeSingle(),
    ]);

    const bcRaw = (eb as { border_catalog?: EquippedBorder | EquippedBorder[] } | null)?.border_catalog ?? null;
    const bc = Array.isArray(bcRaw) ? (bcRaw[0] ?? null) : bcRaw;

    const res = NextResponse.json({
      success: true,
      user: {
        id: raw.id,
        name: raw.name,
        role: roles[0] ?? raw.role,  // primary role — backward compat
        roles,                          // ✅ semua roles — NEW
        shift: raw.shift ?? "PAGI",
        profile_photo_url: dbUser?.profile_photo_url ?? null,
        equipped_border: bc,            // ✅ border Solit Coins ter-equip (bisa null)
        iat: raw.iat,
        exp: raw.exp,
      },
    });
    // Cache 30 detik — aman karena endpoint dilindungi cookie token (per-user unique)
    res.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
    return res;
  } catch {
    return NextResponse.json({ success: false }, { status: 401 });
  }
}