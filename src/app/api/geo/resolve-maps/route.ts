import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_DELIVERY_ROLES } from "@/lib/permissions";

// jalankan di Node runtime (bukan edge) — fetch redirect + text() lebih andal
export const runtime = "nodejs";

/**
 * Ekstrak lat,lng dari URL final ATAU HTML body Google Maps.
 * Google menaruh koordinat di banyak pola berbeda, jadi kita coba berurutan
 * dari yang paling presisi (pin asli) ke yang paling umum.
 */
function extractLatLng(text: string): { lat: number; lng: number } | null {
  const valid = (lat: number, lng: number) =>
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0) ? { lat, lng } : null;

  const patterns: RegExp[] = [
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,                 // pin asli (paling akurat)
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,                      // center kamera
    /[?&](?:q|query|ll|destination|center)=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
    /"latitude":\s*(-?\d{1,2}\.\d+)\s*,\s*"longitude":\s*(-?\d{1,3}\.\d+)/, // blob JSON
    /\[null,null,(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)\]/,         // array data Maps
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const v = valid(parseFloat(m[1]), parseFloat(m[2]));
      if (v) return v;
    }
  }
  return null;
}

async function getHandler(req: NextRequest, _ctx: any, _user: AuthUser) {
  try {
    const shortUrl = new URL(req.url).searchParams.get("url")?.trim();
    if (!shortUrl || !/^https?:\/\//i.test(shortUrl)) {
      return NextResponse.json({ success: false, message: "URL tidak valid" }, { status: 400 });
    }
    // guard SSRF — hanya domain Google Maps
    if (!/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl|maps\.google\.[a-z.]+|www\.google\.[a-z.]+)\//i.test(shortUrl)) {
      return NextResponse.json({ success: false, message: "Hanya link Google Maps yang didukung" }, { status: 400 });
    }

    const res = await fetch(shortUrl, {
      redirect: "follow",
      headers: {
        // UA browser lengkap → kurangi kemungkinan diarahkan ke consent page
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    // 1) coba dari URL final (paling cepat kalau redirect langsung ke peta)
    let coord = extractLatLng(res.url || "");

    // 2) fallback: cari di HTML body (koordinat sering tertanam di sini)
    if (!coord) {
      const html = await res.text();
      coord = extractLatLng(html);
    }

    if (!coord) {
      // sertakan finalUrl biar gampang debug kalau masih gagal
      return NextResponse.json(
        { success: false, message: "Koordinat tidak ditemukan dari link", finalUrl: res.url },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, ...coord });
  } catch (err) {
    console.error("[GET /api/geo/resolve-maps]", err);
    return NextResponse.json({ success: false, message: "Gagal resolve link" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, PREPARATION_DELIVERY_ROLES);