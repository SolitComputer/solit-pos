// src/app/api/auth/me/route.ts
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { getJwtSecret } from "@/lib/auth";

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

    return NextResponse.json({
      success: true,
      user: {
        id: raw.id,
        name: raw.name,
        role: roles[0] ?? raw.role,  // primary role — backward compat
        roles,                          // ✅ semua roles — NEW
        shift: raw.shift ?? "PAGI",
        iat: raw.iat,
        exp: raw.exp,
      },
    });
  } catch {
    return NextResponse.json({ success: false }, { status: 401 });
  }
}