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

// ✅ SECURITY FIX (SSRF): dulu validasi domain pakai regex yang tidak
// di-anchor setelah domain (`maps\.google\.[a-z.]+`), jadi
// "https://maps.google.attacker.com/x" ikut lolos karena [a-z.]+ menyerap
// suffix apa pun. Sekarang dicek exact-match hostname, dan redirect yang
// diikuti (goo.gl short link → tujuan asli) divalidasi ulang di SETIAP hop —
// dulu redirect diikuti otomatis tanpa validasi ulang sama sekali.
const ALLOWED_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "maps.google.com",
  "www.google.com",
  "google.com",
]);

function isAllowedMapsHost(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (ALLOWED_HOSTS.has(host)) return true;
    // Subdomain resmi Google Maps regional, mis. maps.google.co.id —
    // dicek exact match "maps.google.<cc>" 2 segmen, bukan wildcard bebas.
    return /^maps\.google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host);
  } catch {
    return false;
  }
}

async function getHandler(req: NextRequest, _ctx: any, _user: AuthUser) {
  try {
    const shortUrl = new URL(req.url).searchParams.get("url")?.trim();
    if (!shortUrl || !isAllowedMapsHost(shortUrl)) {
      return NextResponse.json({ success: false, message: "Hanya link Google Maps yang didukung" }, { status: 400 });
    }

    const fetchHeaders = {
      // UA browser lengkap → kurangi kemungkinan diarahkan ke consent page
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    };

    // Ikuti redirect manual (bukan `redirect: "follow"`) supaya tiap hop
    // bisa divalidasi ulang ke allowlist yang sama sebelum diikuti — kalau
    // shortlink diarahkan ke host di luar Google Maps, berhenti di situ.
    let currentUrl = shortUrl;
    let res: Response;
    for (let hop = 0; ; hop++) {
      if (hop > 5) {
        return NextResponse.json({ success: false, message: "Terlalu banyak redirect" }, { status: 400 });
      }
      res = await fetch(currentUrl, { redirect: "manual", headers: fetchHeaders });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) break;
        const nextUrl = new URL(location, currentUrl).toString();
        if (!isAllowedMapsHost(nextUrl)) {
          return NextResponse.json({ success: false, message: "Redirect mengarah ke domain yang tidak didukung" }, { status: 400 });
        }
        currentUrl = nextUrl;
        continue;
      }
      break;
    }

    // 1) coba dari URL final (paling cepat kalau redirect langsung ke peta)
    let coord = extractLatLng(res.url || currentUrl || "");

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