// src/lib/rateLimit.ts
// Rate limiter sederhana in-memory (per instance server) — cukup untuk
// endpoint publik yang butuh proteksi dasar dari enumerasi/scraping otomatis,
// tanpa perlu infra tambahan (Redis dll).

const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Cek apakah `key` sudah melewati batas `limit` request dalam jendela waktu
 * `windowMs`. Return true kalau sudah kena limit (request ini harus ditolak).
 */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}
