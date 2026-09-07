// Helper periode untuk Solit Coins.
//
// PENTING: reset harian WAJIB memakai day-boundary 04:00 WIB yang SUDAH ADA di
// sistem absensi (`toAttendanceDateKey` / `addDaysToDateStr` di lib/auth.ts) —
// jangan bikin fungsi tanggal baru yang bisa nyimpang dari logic absensi/lembur.

import { toAttendanceDateKey, addDaysToDateStr } from "@/lib/auth";

/** Day-key "hari absensi" berjalan (YYYY-MM-DD, cutoff 04:00 WIB). */
export function currentDayKey(): string {
  return toAttendanceDateKey(new Date().toISOString());
}

/** Day-key hari Senin dari minggu absensi yang memuat `dayKey`. */
export function weekStartKey(dayKey: string): string {
  const noon = new Date(`${dayKey}T12:00:00Z`);
  const dow = noon.getUTCDay(); // 0=Minggu … 6=Sabtu
  const daysSinceMonday = (dow + 6) % 7;
  return addDaysToDateStr(dayKey, -daysSinceMonday);
}

/** Week-key (Senin) dari minggu berjalan. */
export function currentWeekKey(): string {
  return weekStartKey(currentDayKey());
}

/** Rentang timestamp untuk 1 hari absensi (04:00 WIB → 03:59:59 WIB besoknya). */
export function dayWindow(dayKey: string): { start: string; end: string } {
  return {
    start: `${dayKey}T04:00:00+07:00`,
    end: `${addDaysToDateStr(dayKey, 1)}T03:59:59+07:00`,
  };
}

/** Rentang timestamp untuk 1 minggu absensi (Senin 04:00 → Senin berikutnya 03:59:59). */
export function weekWindow(weekKey: string): { start: string; end: string } {
  return {
    start: `${weekKey}T04:00:00+07:00`,
    end: `${addDaysToDateStr(weekKey, 7)}T03:59:59+07:00`,
  };
}
