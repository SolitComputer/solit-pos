// src/lib/overtimeEngine.ts
// ─────────────────────────────────────────────────────────────────────────
// Kalkulasi lembur berbasis In/Out. Semua fungsi di sini PURE (tanpa efek
// samping/DB call) supaya aman dipakai di server maupun di komponen client.
// ─────────────────────────────────────────────────────────────────────────

export type OvertimeDirection = "BEFORE_IN" | "AFTER_OUT" | "BOTH" | "HOLIDAY" | "MANUAL";
export type OvertimeCategory = "ATASAN" | "PENGAJUAN_ACC" | "MENDESAK";
export type OvertimeColor = "BLUE" | "AMBER" | "GREEN";

export const OVERTIME_CATEGORY_LABELS: Record<OvertimeCategory, string> = {
  ATASAN: "Permintaan Atasan",
  PENGAJUAN_ACC: "Pengajuan yang di ACC",
  MENDESAK: "Mendesak",
};

export const OVERTIME_CATEGORIES: OvertimeCategory[] = ["ATASAN", "PENGAJUAN_ACC", "MENDESAK"];

export const OVERTIME_DIRECTION_LABELS: Record<OvertimeDirection, string> = {
  BEFORE_IN: "Lembur Awal (Sebelum Jam Masuk)",
  AFTER_OUT: "Lembur Akhir (Sesudah Jam Pulang)",
  BOTH: "Lembur Awal & Akhir",
  HOLIDAY: "Hari Libur",
  MANUAL: "Input Manual Admin",
};

export function isValidOvertimeCategory(value: unknown): value is OvertimeCategory {
  return typeof value === "string" && (OVERTIME_CATEGORIES as string[]).includes(value);
}

function toWIBMinutesOfDay(iso: string): number {
  const wib = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  return wib.getUTCHours() * 60 + wib.getUTCMinutes();
}

/**
 * Menit lembur karena absen MASUK lebih awal dari jadwal.
 * ⚠️ Patokannya JAM TERLAMBAT (lateFrom), BUKAN jam buka (start) — jam buka
 * cuma menandai kapan absen boleh mulai dilakukan, bukan jam mulai kerja
 * resminya. Divalidasi ke contoh: in 06:17, lateFrom 08:00 → 1j43m.
 */
export function computeBeforeInOvertimeMinutes(
  checkInISO: string,
  schedule: { lateFrom: { h: number; m: number } }
): number {
  const actual = toWIBMinutesOfDay(checkInISO);
  const scheduledLate = schedule.lateFrom.h * 60 + schedule.lateFrom.m;
  const delta = scheduledLate - actual;
  return delta > 0 ? delta : 0;
}

/**
 * Menit TERLAMBAT — actual masuk lebih telat dari lateFrom. 0 kalau tidak telat.
 * Kebalikan dari computeBeforeInOvertimeMinutes (yang menghitung early/lembur awal).
 * Dipakai untuk kolom "Terlambat" di rekap bulanan.
 */
export function computeLateMinutes(
  checkInISO: string,
  schedule: { lateFrom: { h: number; m: number } }
): number {
  const actual = toWIBMinutesOfDay(checkInISO);
  const scheduledLate = schedule.lateFrom.h * 60 + schedule.lateFrom.m;
  const delta = actual - scheduledLate;
  return delta > 0 ? delta : 0;
}

/** Menit lembur karena absen PULANG lebih larut dari jadwal. 0 kalau tidak lebih larut. */
export function computeAfterOutOvertimeMinutes(
  checkOutISO: string,
  schedule: { checkout: { h: number; m: number } }
): number {
  const actual = toWIBMinutesOfDay(checkOutISO);
  const scheduledCheckout = schedule.checkout.h * 60 + schedule.checkout.m;
  const delta = actual - scheduledCheckout;
  return delta > 0 ? delta : 0;
}

export function computeHolidayOvertimeMinutes(checkInISO: string, checkOutISO: string): number {
  const diffMs = new Date(checkOutISO).getTime() - new Date(checkInISO).getTime();
  return diffMs > 0 ? Math.round(diffMs / 60000) : 0;
}

export function computeCombinedOvertimeMinutes(beforeInMinutes: number, afterOutMinutes: number): number {
  return Math.max(0, beforeInMinutes) + Math.max(0, afterOutMinutes);
}

export interface OvertimeNominalInput {
  baseSalary: number;
  effectiveWorkdays: number;
  overtimeMinutes: number;
  salaryType: "FIXED" | "PERCENTAGE";
}

export interface OvertimeNominalResult {
  perMinuteRate: number;
  nominal: number;
  /** false kalau gaji FLAT/FIXED — memang tidak berhak nominal lembur (poin 10) */
  eligible: boolean;
}

/**
 * Formula (poin 4): (gaji_pokok * 1.5) / hari_efektif_wajib_masuk / 8 / 60 * menit_lembur
 * Gaji FIXED/FLAT selalu menghasilkan nominal 0 (poin 10).
 */
export function computeOvertimeNominal(input: OvertimeNominalInput): OvertimeNominalResult {
  if (input.salaryType === "FIXED") {
    return { perMinuteRate: 0, nominal: 0, eligible: false };
  }
  if (!input.effectiveWorkdays || input.effectiveWorkdays <= 0) {
    return { perMinuteRate: 0, nominal: 0, eligible: true };
  }
  const boosted = input.baseSalary * 1.5;
  const perDay = boosted / input.effectiveWorkdays;
  const perHour = perDay / 8;
  const perMinute = perHour / 60;
  const nominal = Math.round(perMinute * input.overtimeMinutes);
  return { perMinuteRate: perMinute, nominal, eligible: true };
}

/** Hari kerja wajib dalam sebulan (dikurangi libur mingguan/bulanan/tanggal-off, ditambah tukar-libur). */
export function countEffectiveWorkdaysInMonth(
  year: number,
  month0: number,
  weeklyOffDows: Set<number>,
  offDates: Set<string>,
  workOverrideDates: Set<string>
): number {
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(dateKey + "T12:00:00").getDay();
    const isWorkOverride = workOverrideDates.has(dateKey);
    const isWeeklyOff = weeklyOffDows.has(dow) && !isWorkOverride;
    const isDateOff = offDates.has(dateKey) && !isWorkOverride;
    if (!isWeeklyOff && !isDateOff) count++;
  }
  return count;
}

/** Status → warna tampilan (poin 5). Lihat "Asumsi Kunci" untuk penjelasan 3 warna ini. */
export function getOvertimeColor(o: { status: string; audit_status: string }): OvertimeColor {
  if (o.status === "REJECTED" || o.status === "PENDING" || o.status === "CANCELLED") return "BLUE";
  if (o.audit_status === "AUDITED") return "GREEN";
  return "AMBER";
}

export function formatOvertimeMinutes(min: number | null | undefined): string {
  if (!min || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} menit`;
  if (m === 0) return `${h} jam`;
  return `${h} jam ${m} menit`;
}