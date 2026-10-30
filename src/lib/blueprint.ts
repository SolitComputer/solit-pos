// src/lib/blueprint.ts
//
// Helper Blue Print — kunci minggu berjalan (ISO week) sebagai dasar auto-reset mingguan.
// Dihitung di zona Asia/Jakarta (UTC+7) biar pergantian minggu pas tengah malam WIB,
// tidak ikut jam server (yang biasanya UTC).

export function getWeekKey(d: Date = new Date()): string {
  // Geser ke waktu WIB dulu, baru ambil tanggalnya.
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const date = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()));
  const day = date.getUTCDay() || 7; // Minggu(0) -> 7
  date.setUTCDate(date.getUTCDate() + 4 - day); // geser ke Kamis minggu ini
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}