// src/lib/attendanceLocations.ts
//
// Sumber kebenaran titik lokasi absensi per cabang. Dipakai BERSAMA oleh
// client (face-verify/page.tsx) & server (api/auth/face-verify/route.ts)
// supaya aturan geofence selalu konsisten.

export type Branch = "UTAMA" | "JOGJA";

export interface BranchLocation {
  branch: Branch;
  label: string;   // ditampilkan ke user
  lat: number;
  lng: number;
  radius: number;  // meter
}

export const BRANCH_LOCATIONS: BranchLocation[] = [
  {
    branch: "UTAMA",
    label: "Cabang Utama (Depok)",
    lat: -6.402123,
    lng: 106.787296,
    radius: 80,
  },
  {
    branch: "JOGJA",
    label: "Cabang Jogja",
    // Titik toko Solit Jogja (Sinduadi, Sleman) — dari Google Maps.
    lat: -7.762369,
    lng: 110.367699,
    radius: 80,
  },
];

// Haversine — jarak 2 titik GPS dalam meter.
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface ResolveResult {
  branch: Branch | null;       // cabang yang cocok, null = di luar semua radius
  nearest: BranchLocation;     // cabang terdekat (buat pesan error)
  nearestDistance: number;     // meter, dibulatkan
}

/**
 * Tentukan cabang dari posisi GPS.
 * - Default: cek SEMUA cabang, ambil yang user-nya di dalam radius
 *   (kalau masuk >1 radius, ambil yang paling dekat).
 * - `restrictTo`: isi kalau user HANYA boleh absen di 1 cabang (Opsi B).
 */
export function resolveBranchByLocation(lat: number, lng: number, restrictTo?: Branch): ResolveResult {
  const candidates = restrictTo
    ? BRANCH_LOCATIONS.filter((b) => b.branch === restrictTo)
    : BRANCH_LOCATIONS;

  let nearest: BranchLocation = candidates[0];
  let nearestDistance = Infinity;
  let matched: BranchLocation | null = null;
  let matchedDistance = Infinity;

  for (const loc of candidates) {
    const d = distanceMeters(lat, lng, loc.lat, loc.lng);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearest = loc;
    }
    if (d <= loc.radius && d < matchedDistance) {
      matched = loc;
      matchedDistance = d;
    }
  }

  return { branch: matched?.branch ?? null, nearest, nearestDistance: Math.round(nearestDistance) };
}