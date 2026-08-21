// src/app/api/cc-reports/tiktok/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/ccTikTok";

export const dynamic = "force-dynamic";

/**
 * Origin publik yang benar.
 *
 * Kenapa tidak pakai req.nextUrl.origin?
 * Di Hostinger, Next.js jalan di belakang reverse proxy dan bind ke 0.0.0.0:3000,
 * sehingga origin-nya "https://0.0.0.0:3000" → ERR_ADDRESS_INVALID di browser.
 * Domain publik yang sebenarnya dikirim proxy lewat header x-forwarded-*.
 */
function publicOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";

  if (host && !host.startsWith("0.0.0.0") && !host.startsWith("127.0.0.1")) {
    return `${proto}://${host}`;
  }
  // Fallback terakhir kalau header tidak ada
  return process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
}

function back(req: NextRequest, msg: string, ok: boolean): NextResponse {
  const url = new URL("/dashboard/cc-reports/analisa", publicOrigin(req));
  url.searchParams.set("tiktok", ok ? "ok" : "error");
  url.searchParams.set("msg", msg);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const code = sp.get("code");
    const state = sp.get("state");
    const err = sp.get("error_description") ?? sp.get("error");

    if (err) return back(req, err, false);

    if (!code) {
      return back(
        req,
        `TikTok tidak mengirim code. Param diterima: ${sp.toString() || "(kosong)"}`,
        false
      );
    }

    const saved = req.cookies.get("tiktok_oauth_state")?.value;
    if (!saved) {
      return back(
        req,
        "Cookie state hilang — mulai dari https://solit-pos.store, bukan localhost",
        false
      );
    }
    if (saved !== state) {
      return back(req, "State tidak cocok — coba hubungkan ulang", false);
    }

    const out = await exchangeCode(code);

    const res = back(
      req,
      out.ok ? "Akun TikTok berhasil terhubung" : out.error ?? "Gagal menghubungkan",
      out.ok
    );
    res.cookies.set("tiktok_oauth_state", "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Kesalahan tak terduga";
    console.error("[tiktok/callback]", e);
    return back(req, `Callback error: ${msg}`, false);
  }
}