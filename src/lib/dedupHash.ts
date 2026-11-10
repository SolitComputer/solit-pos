// src/lib/dedupHash.ts
// ═══════════════════════════════════════════════════════════════════════
// Dedup Hash Helper — untuk fitur "Deduplikasi Card" di Data Barang
// ─────────────────────────────────────────────────────────────────────────
// Dipakai untuk mendeteksi apakah 2 laptop punya spek IDENTIK (6 field).
// Logic strict: kalau 1 field saja beda → hash beda → tidak dianggap duplikat.
//
// Normalisasi:
//   - trim whitespace (termasuk tab, newline)
//   - lowercase
//   - collapse multiple spaces jadi 1 space ("i5  gen 8" = "i5 gen 8")
//   - NULL/undefined/empty string → literal "~" (sentinel supaya "empty" di 1 field
//     nggak collide dengan laptop lain yang juga empty di field berbeda)
//
// Format hash: SHA-256 via Web Crypto API (di edge/server) atau crypto.subtle (browser)
// Output: hex string 64 char (misal "a3b9c2...")
// ═══════════════════════════════════════════════════════════════════════

export interface LaptopForDedup {
  brand: string | null;
  laptop_name: string | null;
  cpu: string | null;
  ram: string | null;
  storage: string | null;
  gpu: string | null;
}

/**
 * Normalize satu field — lowercase + trim + collapse whitespace.
 * NULL/empty → sentinel "~" supaya tidak collide antar field kosong.
 */
function normalize(v: string | null | undefined): string {
  if (v == null) return "~";
  const trimmed = v.trim().toLowerCase().replace(/\s+/g, " ");
  return trimmed === "" ? "~" : trimmed;
}

/**
 * Compute hash deterministik dari 6 field dedup.
 * Pakai SHA-256 (Web Crypto API) — kompatibel edge runtime & Node modern.
 *
 * @example
 * const hash = await computeDedupHash({
 *   brand: "Lenovo", laptop_name: "Thinkpad L13 G3",
 *   cpu: "i5 Gen 12", ram: "8GB", storage: "256GB SSD", gpu: null
 * });
 * // → "4f8e..." (64 hex chars)
 */
export async function computeDedupHash(laptop: LaptopForDedup): Promise<string> {
  // Urutan field HARUS stabil — jangan diubah supaya hash lama tetap valid.
  const parts = [
    normalize(laptop.brand),
    normalize(laptop.laptop_name),
    normalize(laptop.cpu),
    normalize(laptop.ram),
    normalize(laptop.storage),
    normalize(laptop.gpu),
  ];
  const input = parts.join("|");

  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Bandingkan 2 laptop secara STRICT (semua 6 field harus sama persis setelah normalize).
 * Return true kalau cocok, false kalau ada minimal 1 field beda.
 *
 * Dipakai di endpoint merge manual — guard sebelum eksekusi merge.
 */
export function isLaptopsIdentical(a: LaptopForDedup, b: LaptopForDedup): boolean {
  return (
    normalize(a.brand) === normalize(b.brand) &&
    normalize(a.laptop_name) === normalize(b.laptop_name) &&
    normalize(a.cpu) === normalize(b.cpu) &&
    normalize(a.ram) === normalize(b.ram) &&
    normalize(a.storage) === normalize(b.storage) &&
    normalize(a.gpu) === normalize(b.gpu)
  );
}

/**
 * Daftar field yang berbeda antara 2 laptop — untuk UI feedback.
 * Dipakai di modal "Gabungkan ke Card" supaya user tahu kenapa gak bisa merge.
 *
 * Return array label field yang beda (misal ["Brand", "RAM"]).
 */
export function getDifferingFields(a: LaptopForDedup, b: LaptopForDedup): string[] {
  const diff: string[] = [];
  if (normalize(a.brand) !== normalize(b.brand)) diff.push("Brand");
  if (normalize(a.laptop_name) !== normalize(b.laptop_name)) diff.push("Nama Laptop");
  if (normalize(a.cpu) !== normalize(b.cpu)) diff.push("CPU");
  if (normalize(a.ram) !== normalize(b.ram)) diff.push("RAM");
  if (normalize(a.storage) !== normalize(b.storage)) diff.push("Storage");
  if (normalize(a.gpu) !== normalize(b.gpu)) diff.push("GPU");
  return diff;
}