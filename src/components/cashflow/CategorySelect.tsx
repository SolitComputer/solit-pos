// src/components/cashflow/CategorySelect.tsx
// src/components/cashflow/CategorySelect.tsx
"use client";

import { useMemo } from "react";
import {
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
  AUTO_INCOME_CATEGORIES,
  categoryLabel,
  type CashflowDirection,
  type CustomCashflowCategory, // ⬅️ BARU
} from "@/lib/cashflow";
import { CASHFLOW_ACCOUNT } from "@/lib/accounting";

// ⬅️ UPDATE — tambah flag isCustom supaya UI bisa membedakan kategori bawaan
// vs custom (misal ikon kecil / group label "Kategori Custom" di dropdown).
export type CategoryOption = {
  key: string;
  label: string;
  accountCode: string;
  isCustom?: boolean; // ⬅️ BARU
};

// Opsi kategori sudah terurut A–Z (locale id) + kode akun (ID Akun) dari
// CASHFLOW_ACCOUNT — peta yang SAMA dipakai saat posting ke Jurnal Umum, jadi ID
// yang tampil dijamin konsisten dengan akuntansi, bukan ID statis/karangan.
//
// ⬅️ UPDATE — tambah parameter customCategories (opsional). Kategori custom yang
// is_active=true & direction cocok ikut muncul di dropdown, ditandai isCustom=true
// supaya UI bisa kasih separator "── Kategori Custom ──" di antara keduanya.
export function getCategoryOptions(
  direction: CashflowDirection,
  customCategories: CustomCashflowCategory[] = [] // ⬅️ BARU
): CategoryOption[] {
  const base =
    direction === "IN"
      ? Object.entries(INCOME_CATEGORIES).filter(
          ([key]) => !(AUTO_INCOME_CATEGORIES as readonly string[]).includes(key)
        )
      : Object.entries(EXPENSE_CATEGORIES);

  const builtInOptions: CategoryOption[] = base
    .map(([key, label]) => ({
      key,
      label: label as string,
      accountCode: CASHFLOW_ACCOUNT[key] ?? "—",
      isCustom: false,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "id"));

  // ⬅️ BARU — Kategori custom yang aktif & match direction (BOTH match semuanya)
  const customOptions: CategoryOption[] = customCategories
    .filter((c) => c.is_active)
    .filter((c) => c.direction === "BOTH" || c.direction === direction)
    .map((c) => ({
      key: c.key,
      label: c.label,
      accountCode: c.account_code,
      isCustom: true,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "id"));

  // Kategori bawaan di atas, custom di bawah — dipisah secara URUTAN, bukan
  // <optgroup> karena beberapa browser mobile render optgroup aneh.
  return [...builtInOptions, ...customOptions];
}

export function formatCategoryOptionLabel(o: CategoryOption): string {
  // ID akun ditulis kalem di belakang label (pemisah titik tengah) biar
  // tetap kebaca tapi tidak menyita perhatian. Native <option> tidak bisa
  // diwarnai per-bagian, jadi "samar"-nya lewat gaya tulis, bukan warna.
  // ⬅️ UPDATE — kategori custom diberi suffix "✨" supaya user langsung tahu
  // mana yang dari sistem vs mana yang mereka buat sendiri.
  const customMark = o.isCustom ? "  ✨" : "";
  return `${o.label}  ·  ${o.accountCode}${customMark}`;
}
export default function CategorySelect({
  direction,
  value,
  onChange,
  className = "",
  disabled = false,
  required = false,
  id,
  placeholder = "Pilih Kategori",
  customCategories = [], // ⬅️ BARU
}: {
  direction: CashflowDirection;
  value: string;
  onChange: (categoryKey: string) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  placeholder?: string;
  customCategories?: CustomCashflowCategory[]; // ⬅️ BARU
}) {
  const options = useMemo(
    () => getCategoryOptions(direction, customCategories),
    [direction, customCategories]
  );

  // Kategori lama (legacy, mis. "UTANG") yang tersimpan di entry yang sedang
  // DIEDIT tapi tidak lagi ditawarkan di dropdown baru — tetap dirender sebagai
  // opsi agar nilai lama tidak "hilang" saat form Edit dibuka.
  //
  // ⬅️ UPDATE — kategori custom yang sudah diarsipkan (is_active=false) juga
  // ikut skenario ini: entry lama yang pakai kategori ini tetap tampil labelnya,
  // diambil dari daftar customCategories yang full (termasuk is_active=false).
  const valueInOptions = value === "" || options.some((o) => o.key === value);
  const customFallback = !valueInOptions && value
    ? customCategories.find((c) => c.key === value)
    : null;

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="" disabled={required}>
        {placeholder}
      </option>
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {formatCategoryOptionLabel(o)}
        </option>
      ))}
      {!valueInOptions && value && (
        <option value={value}>
          {customFallback
            ? `${customFallback.label}  ·  ${customFallback.account_code}  (diarsip)`
            : `${categoryLabel(direction, value, customCategories)}  ·  ${CASHFLOW_ACCOUNT[value] ?? "—"}`}
        </option>
      )}
    </select>
  );
}