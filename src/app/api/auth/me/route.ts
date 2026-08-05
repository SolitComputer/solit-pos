import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { getJwtSecret } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

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

    const { data: dbUser } = await supabase
      .from("users")
      .select("profile_photo_url")
      .eq("id", raw.id)
      .maybeSingle();

    const res = NextResponse.json({
      success: true,
      user: {
        id: raw.id,
        name: raw.name,
        role: roles[0] ?? raw.role,  // primary role — backward compat
        roles,                          // ✅ semua roles — NEW
        shift: raw.shift ?? "PAGI",
        profile_photo_url: dbUser?.profile_photo_url ?? null,
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