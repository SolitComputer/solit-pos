/**
 * Memecah array besar menjadi array dari array-array kecil (chunks).
 * Berguna untuk mengatasi batas ukuran filter seperti .in("id", [...]) di Supabase,
 * yang bisa gagal (HTTP 400/414) jika terlalu banyak (misal > 200).
 *
 * @param array Array sumber yang ingin dipecah.
 * @param size Ukuran maksimum setiap chunk. Disarankan 100 - 150 untuk id UUID/Text.
 * @returns Array dua dimensi, di mana setiap elemen adalah chunk.
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
