// src/app/api/cc-reports/tiktok/connect/route.ts
import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/ccTikTok";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

// GET → redirect ke halaman authorize TikTok
export async function GET() {
  if (!process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_REDIRECT_URI) {
    return NextResponse.json(
      { success: false, error: "TIKTOK_CLIENT_KEY / TIKTOK_REDIRECT_URI belum di-set" },
      { status: 500 }
    );
  }

  // CSRF guard: state disimpan di cookie, dicocokkan saat callback
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set("tiktok_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 menit
  });
  return res;
}