import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/ccTikTok";

export const dynamic = "force-dynamic";

const back = (msg: string, ok: boolean) =>
  NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/cc-reports/analisa` +
      `?tiktok=${ok ? "ok" : "error"}&msg=${encodeURIComponent(msg)}`
  );

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  const state = sp.get("state");
  const err = sp.get("error_description") ?? sp.get("error");

  if (err) return back(err, false);
  if (!code) return back("Tidak ada authorization code", false);

  // Validasi state (CSRF)
  const saved = req.cookies.get("tiktok_oauth_state")?.value;
  if (!saved || saved !== state) {
    return back("State tidak cocok — coba hubungkan ulang", false);
  }

  const out = await exchangeCode(code);

  const res = back(
    out.ok ? "Akun TikTok berhasil terhubung" : out.error ?? "Gagal menghubungkan",
    out.ok
  );
  res.cookies.set("tiktok_oauth_state", "", { path: "/", maxAge: 0 });
  return res;
}