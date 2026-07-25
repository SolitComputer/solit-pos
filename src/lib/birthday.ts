/**
 * Helper perhitungan ulang tahun.
 *
 * Semua fungsi di sini PURE (tanggal "hari ini" selalu dikirim dari caller),
 * jadi hasilnya deterministik dan aman dari hydration mismatch:
 * komponen yang memakainya cukup men-set `today` sekali setelah mount.
 */

export const MONTH_NAMES_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Tengah malam hari ini di timezone browser/server. */
export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * `birth_date` dari Supabase bertipe DATE (contoh: "1998-04-17").
 * Sengaja di-append "T00:00:00" (bukan `new Date("1998-04-17")`) supaya
 * di-parse sebagai waktu LOKAL, bukan UTC — kalau tidak, user di WIB (UTC+7)
 * akan melihat tanggalnya mundur satu hari.
 */
export function parseBirthDate(birthDate: string | null): Date | null {
  if (!birthDate) return null;
  const d = new Date(`${birthDate.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Ulang tahun berikutnya (bisa hari ini). 29 Februari di tahun non-kabisat
 * otomatis jatuh ke 1 Maret karena normalisasi bawaan `Date`.
 */
export function getNextBirthday(birth: Date, today: Date): Date {
  const base = startOfDay(today);
  let next = new Date(base.getFullYear(), birth.getMonth(), birth.getDate());
  next.setHours(0, 0, 0, 0);
  if (next.getTime() < base.getTime()) {
    next = new Date(base.getFullYear() + 1, birth.getMonth(), birth.getDate());
    next.setHours(0, 0, 0, 0);
  }
  return next;
}

/** 0 = hari ini, 1 = besok, dst. */
export function daysUntilBirthday(birth: Date, today: Date): number {
  const next = getNextBirthday(birth, today);
  return Math.round((next.getTime() - startOfDay(today).getTime()) / MS_PER_DAY);
}

/** Umur saat ini (tahun penuh). */
export function getAge(birth: Date, today: Date): number {
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/** Umur yang akan dicapai pada ulang tahun berikutnya. */
export function getTurningAge(birth: Date, today: Date): number {
  return getNextBirthday(birth, today).getFullYear() - birth.getFullYear();
}

export function isBirthdayToday(birth: Date, today: Date): boolean {
  return birth.getDate() === today.getDate() && birth.getMonth() === today.getMonth();
}

/** "17 April" — tanpa tahun, dipakai di kartu daftar. */
export function formatDayMonth(birth: Date): string {
  return `${birth.getDate()} ${MONTH_NAMES_ID[birth.getMonth()]}`;
}

/** "17 April 1998" — dipakai di detail. */
export function formatFullDate(birth: Date): string {
  return `${formatDayMonth(birth)} ${birth.getFullYear()}`;
}

export function formatCountdown(days: number): string {
  if (days === 0) return "Hari ini";
  if (days === 1) return "Besok";
  return `${days} hari lagi`;
}

/**
 * Normalisasi nomor HP Indonesia ke format wa.me (62xxxx).
 * Mengembalikan null kalau nomornya tidak masuk akal.
 */
export function toWhatsAppNumber(phone: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (!digits.startsWith("62")) digits = `62${digits}`;
  return digits.length >= 10 ? digits : null;
}