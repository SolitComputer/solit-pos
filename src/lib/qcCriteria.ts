// lib/qcCriteria.ts
// ═══════════════════════════════════════════════════════════════════════
// QC Criteria Validator
// ─────────────────────────────────────────────────────────────────────────
// Kapan sebuah unit dianggap "QC_DONE" (otomatis SIAP_JUAL)?
// → Ketika SEMUA field wajib sudah diisi (NULL = kosong, 0 = terisi).
//
// Aturan dari SOLIT03:
//   - NULL/undefined/"" → dianggap BELUM diisi
//   - 0                 → dianggap SUDAH diisi (user sengaja isi 0)
//
// Revisi (2026-11-19): `sparepart_cost` & `condition_note` DIKELUARKAN
// dari field wajib. Aturan sekarang 10 field wajib (5 parent + 5 unit):
//   - Parent: laptop_name, brand, cpu, ram, storage
//   - Unit:   serial_number, grade, source, purchase_price, selling_price
// `official_price` tetap dicek sbg safety-net untuk data lama,
// tapi auto-isi dari selling_price + Rp 300.000 di UI.
// ═══════════════════════════════════════════════════════════════════════

export interface LaptopForQc {
  brand: string | null;
  cpu: string | null;
  ram: string | null;
  storage: string | null;
  laptop_name: string | null;
}

export interface LaptopUnitForQc {
  serial_number: string | null;
  grade: string | null;
  source: string | null;
  condition_note: string | null;
  purchase_price: number | string | null;
  sparepart_cost: number | string | null;
  selling_price: number | string | null;
  official_price: number | string | null;
}

/** Cek field TEXT: null / undefined / string kosong → belum diisi */
export function isTextFilled(v: string | null | undefined): boolean {
  if (v === null || v === undefined) return false;
  return v.trim() !== "";
}

/** Cek field NUMBER: null / undefined / NaN → belum diisi. 0 → sudah diisi */
export function isNumberFilled(v: number | string | null | undefined): boolean {
  if (v === null || v === undefined) return false;
  const n = Number(v);
  return !Number.isNaN(n);
}

/**
 * Cek apakah sebuah unit sudah lengkap kriteria QC-nya.
 * Dipakai di:
 *  - PATCH /api/units/[id]      → auto QC_DONE saat semua field terisi
 *  - POST  /api/laptops/qc      → validasi submit QC
 *  - SELESAI sparepart          → cek apakah balik ke SIAP_JUAL atau NEEDS_QC
 */
export function isUnitQcComplete(unit: LaptopUnitForQc, laptop: LaptopForQc): boolean {
  // ── Field TEXT level unit ──
  // condition_note TIDAK lagi wajib per 2026-11-19 — gak semua unit butuh catatan.
  const unitTextOk =
    isTextFilled(unit.serial_number) &&
    isTextFilled(unit.grade) &&
    isTextFilled(unit.source);

  // ── Field NUMBER level unit (boleh 0, asal sudah di-set) ──
  // sparepart_cost TIDAK lagi wajib per 2026-11-19 — unit mulus = Rp 0 gak perlu dipaksa isi.
  const unitNumberOk =
    isNumberFilled(unit.purchase_price) &&
    isNumberFilled(unit.selling_price) &&
    isNumberFilled(unit.official_price);

  // ── Field TEXT level model (parent laptop) ──
  const laptopOk =
    isTextFilled(laptop.brand) &&
    isTextFilled(laptop.cpu) &&
    isTextFilled(laptop.ram) &&
    isTextFilled(laptop.storage) &&
    isTextFilled(laptop.laptop_name);

  return unitTextOk && unitNumberOk && laptopOk;
}

/**
 * Daftar field yang masih kosong — untuk UI feedback "field X belum diisi".
 */
export function getMissingQcFields(unit: LaptopUnitForQc, laptop: LaptopForQc): string[] {
  const missing: string[] = [];

  if (!isTextFilled(unit.serial_number)) missing.push("Serial Number");
  if (!isTextFilled(unit.grade)) missing.push("Grade");
  if (!isTextFilled(unit.source)) missing.push("Sumber");
  // condition_note TIDAK lagi wajib per 2026-11-19 — tidak dilaporkan sbg missing.

  if (!isNumberFilled(unit.purchase_price)) missing.push("Harga Modal");
  // sparepart_cost TIDAK lagi wajib per 2026-11-19 — tidak dilaporkan sbg missing.
  if (!isNumberFilled(unit.selling_price)) missing.push("Harga Setor");
  if (!isNumberFilled(unit.official_price)) missing.push("Harga Official");

  if (!isTextFilled(laptop.brand)) missing.push("Brand");
  if (!isTextFilled(laptop.cpu)) missing.push("CPU");
  if (!isTextFilled(laptop.ram)) missing.push("RAM");
  if (!isTextFilled(laptop.storage)) missing.push("Storage");
  if (!isTextFilled(laptop.laptop_name)) missing.push("Nama Laptop");

  return missing;
}