// src/components/cashflow/CategorySelect.tsx
"use client";

import { useMemo } from "react";
import {
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
  AUTO_INCOME_CATEGORIES,
  categoryLabel,
  type CashflowDirection,
} from "@/lib/cashflow";
import { CASHFLOW_ACCOUNT } from "@/lib/accounting";

export type CategoryOption = { key: string; label: string; accountCode: string };

// Opsi kategori sudah terurut A–Z (locale id) + kode akun (ID Akun) dari
// CASHFLOW_ACCOUNT — peta yang SAMA dipakai saat posting ke Jurnal Umum, jadi ID
// yang tampil dijamin konsisten dengan akuntansi, bukan ID statis/karangan.
export function getCategoryOptions(direction: CashflowDirection): CategoryOption[] {
  const base =
    direction === "IN"
      ? Object.entries(INCOME_CATEGORIES).filter(
          ([key]) => !(AUTO_INCOME_CATEGORIES as readonly string[]).includes(key)
        )
      : Object.entries(EXPENSE_CATEGORIES);

  return base
    .map(([key, label]) => ({
      key,
      label: label as string,
      accountCode: CASHFLOW_ACCOUNT[key] ?? "—",
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "id")); // A–Z, Bahasa Indonesia
}

export function formatCategoryOptionLabel(o: CategoryOption): string {
  // ID akun ditulis kalem di belakang label (pemisah titik tengah) biar
  // tetap kebaca tapi tidak menyita perhatian. Native <option> tidak bisa
  // diwarnai per-bagian, jadi "samar"-nya lewat gaya tulis, bukan warna.
  return `${o.label}  ·  ${o.accountCode}`;
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
}: {
  direction: CashflowDirection;
  value: string;
  onChange: (categoryKey: string) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  placeholder?: string;
}) {
  const options = useMemo(() => getCategoryOptions(direction), [direction]);

  // Kategori lama (legacy, mis. "UTANG") yang tersimpan di entry yang sedang
  // DIEDIT tapi tidak lagi ditawarkan di dropdown baru — tetap dirender sebagai
  // opsi agar nilai lama tidak "hilang" saat form Edit dibuka.
  const valueInOptions = value === "" || options.some((o) => o.key === value);

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
          {categoryLabel(direction, value)}  ·  {CASHFLOW_ACCOUNT[value] ?? "—"}
        </option>
      )}
    </select>
  );
}