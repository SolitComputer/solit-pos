// src/app/api/cc-reports/tiktok/connect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/ccTikTok";
import { normalizeBrand } from "@/lib/ccReports";
import { getCurrentUser } from "@/lib/auth";
import { hasAnyRole, CC_REPORT_MANAGE_ROLES } from "@/lib/permissions";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

// Halaman tujuan redirect kalau role ditolak / env kurang — bawa flash msg
// biar user langsung tau alasannya, konsisten sama callback yang pakai ?tiktok=err&msg=
const ANALISA_URL = "/dashboard/cc-reports/analisa";

function redirectWithError(req: NextRequest, msg: string) {
  const url = new URL(ANALISA_URL, req.url);
  url.searchParams.set("tiktok", "err");
  url.searchParams.set("msg", msg);
  return NextResponse.redirect(url);
}

// GET → redirect ke halaman authorize TikTok
export async function GET(req: NextRequest) {
  // 🔒 Guard role — konsisten sama /instagram/connect. OAuth flow ini nyimpen
  //    kredensial brand ke DB, jadi hanya pengelola CC yang boleh mulai.
  //    Dicek di sini juga (bukan cuma UI) supaya nggak bisa di-bypass dengan
  //    buka URL /connect langsung di browser.
  const currentUser = await getCurrentUser();
  if (!currentUser || !hasAnyRole(currentUser.roles ?? [currentUser.role], CC_REPORT_MANAGE_ROLES)) {
    return redirectWithError(req, "Kamu tidak punya akses untuk menghubungkan TikTok");
  }

  if (!process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_REDIRECT_URI) {
    // Env kurang → redirect balik dengan pesan, bukan JSON 500 (biar UX sama).
    return redirectWithError(req, "TIKTOK_CLIENT_KEY / TIKTOK_REDIRECT_URI belum di-set di env");
  }

  // Brand mana yang mau dihubungkan (?brand=Sotech). Default → Solit.
  const brand = normalizeBrand(req.nextUrl.searchParams.get("brand"));

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 menit
  };

  // CSRF guard: state disimpan di cookie, dicocokkan saat callback
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set("tiktok_oauth_state", state, cookieOpts);
  res.cookies.set("tiktok_oauth_brand", brand, cookieOpts); // dibaca di callback
  return res;
}