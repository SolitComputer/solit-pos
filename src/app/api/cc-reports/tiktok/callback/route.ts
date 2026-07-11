// src/app/api/cc-reports/tiktok/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/ccTikTok";

export const dynamic = "force-dynamic";

/**
 * Redirect balik ke halaman Analisa.
 * ✅ Origin diambil dari request (req.nextUrl.origin), BUKAN dari
 *    NEXT_PUBLIC_APP_URL — env NEXT_PUBLIC_* di-inline saat build, jadi
 *    kalau di-set setelah build nilainya undefined → URL invalid → 500.
 */
function back(req: NextRequest, msg: string, ok: boolean): NextResponse {
  const url = new URL("/dashboard/cc-reports/analisa", req.nextUrl.origin);
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

    // ✅ Log semua param mentah dari TikTok — biar penyebabnya kelihatan
    console.log("[tiktok/callback] params:", Object.fromEntries(sp.entries()));

    if (err) return back(req, err, false);

    if (!code) {
      // Callback tanpa code = user batal, TikTok error, atau URL dibuka langsung
      return back(
        req,
        `TikTok tidak mengirim code. Param diterima: ${sp.toString() || "(kosong)"}`,
        false
      );
    }

    const saved = req.cookies.get("tiktok_oauth_state")?.value;
    if (!saved) {
      // ✅ Penyebab paling umum: alur dimulai dari domain berbeda (localhost)
      return back(
        req,
        "Cookie state hilang — mulai proses 'Hubungkan TikTok' dari domain yang sama (https://solit-pos.store), bukan localhost",
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