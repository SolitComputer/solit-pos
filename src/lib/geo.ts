// src/lib/geo.ts
// Geocoding & routing berbasis OpenStreetMap (gratis, tanpa API key).
// CATATAN PRODUCTION: server publik Nominatim/OSRM ada rate-limit & bukan untuk
// beban berat. Untuk skala bisnis, ganti BASE URL ke Mapbox / LocationIQ / OSRM
// self-host — cukup di file ini.

export interface GeoPlace { label: string; lat: number; lng: number; type?: string }
export interface RouteResult { distanceM: number; durationS: number; coords: [number, number][] }
export interface ReverseResult {
    road: string | null; area: string | null; label: string;
    category: string | null; type: string | null; name: string | null;
}

const NOMINATIM = "https://nominatim.openstreetmap.org";
const OSRM = "https://router.project-osrm.org";

// Bias hasil ke Jabodetabek (lon1,lat1,lon2,lat2)
const VIEWBOX = "106.5,-6.1,107.1,-6.6";

// ⚠️ GANTI ke titik toko Solit 03 yang asli (lat,lng). Dipakai buat estimasi & pulang.
export const STORE_ORIGIN = { lat: -6.4025, lng: 106.7942 };

// ───── util matematika ─────
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const la1 = (a.lat * Math.PI) / 180, la2 = (b.lat * Math.PI) / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}
export function bearingDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const la1 = (a.lat * Math.PI) / 180, la2 = (b.lat * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const y = Math.sin(dLng) * Math.cos(la2);
    const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<GeoPlace[]> {
    const query = q.trim();
    if (query.length < 3) return [];
    const url =
        `${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=6` +
        `&countrycodes=id&viewbox=${VIEWBOX}&bounded=0&q=${encodeURIComponent(query)}`;
    try {
        const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
        if (!res.ok) return [];
        const data = (await res.json()) as any[];
        return data.map((d) => ({ label: d.display_name, lat: parseFloat(d.lat), lng: parseFloat(d.lon), type: d.type }));
    } catch { return []; }
}

const reverseCache = new Map<string, ReverseResult>();
let lastReverse = 0;
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseResult | null> {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = reverseCache.get(key);
    if (cached) return cached;

    const wait = 1100 - (Date.now() - lastReverse);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastReverse = Date.now();

    try {
        const res = await fetch(`${NOMINATIM}/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${lat}&lon=${lng}`, {
            headers: { Accept: "application/json" },
        });
        if (!res.ok) return null;
        const d = await res.json();
        const addr = d.address ?? {};
        const road = addr.road ?? addr.pedestrian ?? addr.footway ?? null;
        const area = addr.suburb ?? addr.village ?? addr.neighbourhood ?? addr.city_district ?? addr.town ?? null;
        const result: ReverseResult = {
            road, area,
            category: d.class ?? d.category ?? null,
            type: d.type ?? null,
            name: d.name || addr.amenity || addr.shop || null,
            label: [road, area].filter(Boolean).join(", ") ||
                (d.display_name?.split(",").slice(0, 2).join(",") ?? "Lokasi tidak dikenal"),
        };
        reverseCache.set(key, result);
        return result;
    } catch { return null; }
}

export function classifyStop(r: ReverseResult | null): { kind: string; emoji: string; suspect: boolean } {
    if (!r) return { kind: "Lokasi tidak dikenal", emoji: "❓", suspect: true };
    const t = (r.type ?? "").toLowerCase();
    const c = (r.category ?? "").toLowerCase();
    const fuelByName = /pom|pertamina|spbu|shell|\bbp\b|fuel|bensin/i.test(r.name ?? "");

    if (t === "fuel" || fuelByName)
        return { kind: `Pom Bensin${r.name ? " — " + r.name : ""}`, emoji: "⛽", suspect: false };
    if (["restaurant", "cafe", "fast_food", "food_court"].includes(t) || c === "shop")
        return { kind: `Mampir: ${r.name ?? "Warung/Toko"}`, emoji: "🍜", suspect: true };
    if (["apartments", "residential", "house", "dormitory"].includes(t) || c === "building")
        return { kind: `Perumahan/Apartemen${r.name ? " — " + r.name : ""}`, emoji: "🏢", suspect: true };
    return { kind: `Berhenti di ${r.road ?? "jalan"} (kemungkinan macet/lampu merah)`, emoji: "🚦", suspect: false };
}

export async function getRoute(
    from: { lat: number; lng: number }, to: { lat: number; lng: number }
): Promise<RouteResult | null> {
    try {
        const res = await fetch(
            `${OSRM}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
        );
        if (!res.ok) return null;
        const d = await res.json();
        const route = d.routes?.[0];
        if (!route) return null;
        const coords: [number, number][] = (route.geometry.coordinates as [number, number][]).map(([lon, lat]) => [lat, lon]);
        return { distanceM: route.distance, durationS: route.duration, coords };
    } catch { return null; }
}

// ───── formatter ─────
export const fmtDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
export const fmtDuration = (s: number) => {
    const min = Math.round(s / 60);
    return min < 60 ? `${min} mnt` : `${Math.floor(min / 60)} jam ${min % 60} mnt`;
};
export const fmtSpeed = (mps: number | null | undefined) =>
  mps == null || isNaN(mps) || mps < 0 ? "—" : `${Math.round(mps * 3.6)} km/j`;

export function computeSpeedKmh(points: { lat: number; lng: number; t?: number }[]): number | null {
  const pts = points.filter((p) => p.t != null).slice(-5);
  if (pts.length < 2) return null;
  let dist = 0;
  for (let i = 1; i < pts.length; i++) dist += haversineM(pts[i - 1], pts[i]);
  const dt = (pts[pts.length - 1].t! - pts[0].t!) / 1000;
  if (dt <= 0) return null;
  const mps = dist / dt;
  if (mps < 0.7) return 0;    
  if (mps > 45) return null; 
  return mps * 3.6;
}