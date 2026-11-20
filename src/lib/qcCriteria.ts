// lib/qcCriteria.ts
// ═══════════════════════════════════════════════════════════════════════
// QC Criteria Validator — v2 (SN-First support, 2026-11-20)
// ─────────────────────────────────────────────────────────────────────────
// Untuk SN Lepas (laptop_id=NULL), field model (brand/cpu/ram/storage/nama)
// dibaca dari laptop_units.{name,brand,cpu,ram,storage} sebagai fallback.
// Fungsi check sekarang HYBRID: prefer unit field (kalau terisi), fallback
// ke laptop. Ini bikin SN Lepas tetap bisa lolos QC asal field unit terisi.
//
// Aturan field wajib tetap 10 (5 model + 5 unit, sparepart/condition optional).
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
  // ⬅️ BARU (Step 4): fallback field dari unit level untuk SN Lepas
  name?: string | null;
  brand?: string | null;
  cpu?: string | null;
  ram?: string | null;
  storage?: string | null;
}

export function isTextFilled(v: string | null | undefined): boolean {
  if (v === null || v === undefined) return false;
  return v.trim() !== "";
}

export function isNumberFilled(v: number | string | null | undefined): boolean {
  if (v === null || v === undefined) return false;
  const n = Number(v);
  return !Number.isNaN(n);
}

/**
 * Cek apakah sebuah unit sudah lengkap kriteria QC-nya.
 * Field model hybrid read: prefer unit.{name,brand,cpu,ram,storage},
 * fallback ke laptop.{laptop_name,brand,cpu,ram,storage}.
 */
export function isUnitQcComplete(unit: LaptopUnitForQc, laptop: LaptopForQc): boolean {
  const unitTextOk =
    isTextFilled(unit.serial_number) &&
    isTextFilled(unit.grade) &&
    isTextFilled(unit.source);

  const unitNumberOk =
    isNumberFilled(unit.purchase_price) &&
    isNumberFilled(unit.selling_price) &&
    isNumberFilled(unit.official_price);

  // Hybrid read — prefer unit, fallback laptop
  const name = unit.name ?? laptop.laptop_name;
  const brand = unit.brand ?? laptop.brand;
  const cpu = unit.cpu ?? laptop.cpu;
  const ram = unit.ram ?? laptop.ram;
  const storage = unit.storage ?? laptop.storage;

  const laptopOk =
    isTextFilled(brand) &&
    isTextFilled(cpu) &&
    isTextFilled(ram) &&
    isTextFilled(storage) &&
    isTextFilled(name);

  return unitTextOk && unitNumberOk && laptopOk;
}

/** Daftar field yang masih kosong — untuk UI feedback. */
export function getMissingQcFields(unit: LaptopUnitForQc, laptop: LaptopForQc): string[] {
  const missing: string[] = [];

  if (!isTextFilled(unit.serial_number)) missing.push("Serial Number");
  if (!isTextFilled(unit.grade)) missing.push("Grade");
  if (!isTextFilled(unit.source)) missing.push("Sumber");

  if (!isNumberFilled(unit.purchase_price)) missing.push("Harga Modal");
  if (!isNumberFilled(unit.selling_price)) missing.push("Harga Setor");
  if (!isNumberFilled(unit.official_price)) missing.push("Harga Official");

  // Hybrid check
  if (!isTextFilled(unit.brand ?? laptop.brand)) missing.push("Brand");
  if (!isTextFilled(unit.cpu ?? laptop.cpu)) missing.push("CPU");
  if (!isTextFilled(unit.ram ?? laptop.ram)) missing.push("RAM");
  if (!isTextFilled(unit.storage ?? laptop.storage)) missing.push("Storage");
  if (!isTextFilled(unit.name ?? laptop.laptop_name)) missing.push("Nama Laptop");

  return missing;
}