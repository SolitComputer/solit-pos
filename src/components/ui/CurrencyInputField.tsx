"use client";
// src/components/ui/CurrencyInputField.tsx
//
// Kenapa <input type="number"> bermasalah untuk field nominal/uang:
// 1. Scroll wheel di atas field yang lagi fokus bikin value naik/turun tanpa
//    sengaja.
// 2. Tombol spinner atas/bawah bawaan browser kekecilan, gampang ke-klik gak
//    sengaja.
// Solusinya: <input type="text" inputMode="numeric"> — tidak ada spinner,
// tidak kena efek scroll wheel, tetap munculin keyboard angka di HP, dan
// ditampilkan dengan pemisah ribuan (id-ID) biar gampang dibaca. Value yang
// dikirim ke parent lewat onChange tetap number murni, bukan string berformat.
//
// Dua export, satu logic (supaya tidak duplikasi di tiap file pemanggil):
// - CurrencyInput      → drop-in pengganti <input type="number">, TANPA
//                        wrapper/label/ikon — dipakai saat layout (label,
//                        border, Field wrapper) sudah ada di pemanggil.
// - CurrencyInputField → versi berdiri sendiri (label + kotak biru + ikon
//                        bank + helper text opsional).

import { useEffect, useId, useState } from "react";

function formatThousands(digitsOnly: string): string {
  if (!digitsOnly) return "";
  const numeric = Number(digitsOnly);
  if (Number.isNaN(numeric)) return "";
  return numeric.toLocaleString("id-ID");
}

interface CurrencyInputProps {
  /** Nilai numerik murni (bukan string berformat) — dikontrol dari parent */
  value: number;
  /** Dipanggil setiap value berubah, selalu mengirim number murni */
  onChange: (value: number) => void;
  /** Opsional: batas nominal, dipakai untuk validasi ringan (bukan step spinner) */
  max?: number;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  autoFocus?: boolean;
  required?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}

/** Drop-in pengganti <input type="number"> untuk field nominal/uang — tanpa wrapper/label/ikon. */
export function CurrencyInput({
  value,
  onChange,
  max,
  className = "",
  placeholder = "0",
  disabled,
  id,
  name,
  autoFocus,
  required,
  onKeyDown,
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState(() =>
    value > 0 ? value.toLocaleString("id-ID") : "",
  );

  // Sinkron ulang tampilan kalau value berubah dari luar (misal reset form)
  useEffect(() => {
    setDisplayValue(value > 0 ? value.toLocaleString("id-ID") : "");
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digitsOnly = e.target.value.replace(/\D/g, "");
    const numeric = digitsOnly ? Number(digitsOnly) : 0;

    if (max !== undefined && numeric > max) {
      setDisplayValue(max.toLocaleString("id-ID"));
      onChange(max);
      return;
    }

    setDisplayValue(formatThousands(digitsOnly));
    onChange(numeric);
  }

  return (
    <input
      id={id}
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      autoFocus={autoFocus}
      required={required}
      disabled={disabled}
      value={displayValue}
      onChange={handleChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={className}
    />
  );
}

interface CurrencyInputFieldProps {
  /** Label di atas field, contoh: "NOMINAL DP (UANG MUKA)" */
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Opsional: teks bantuan di bawah field, contoh "Sisa Tagihan: Rp0" */
  helperLabel?: string;
  helperValue?: string;
  max?: number;
  disabled?: boolean;
  className?: string;
}

/** Field nominal/uang berdiri sendiri: label + kotak biru + ikon bank + helper text opsional. */
export function CurrencyInputField({
  label,
  value,
  onChange,
  helperLabel,
  helperValue,
  max,
  disabled,
  className = "",
}: CurrencyInputFieldProps) {
  const inputId = useId();

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-xs font-medium text-blue-900"
      >
        {label}
      </label>

      <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 focus-within:border-blue-300 focus-within:ring-1 focus-within:ring-blue-300">
        <BankIcon className="h-4 w-4 shrink-0 text-blue-400" />
        <span className="text-sm text-gray-500">Rp</span>
        <CurrencyInput
          id={inputId}
          value={value}
          onChange={onChange}
          max={max}
          disabled={disabled}
          className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:text-gray-400"
        />
      </div>

      {helperLabel && (
        <p className="mt-1.5 text-xs text-gray-500">
          {helperLabel}{' '}
          <span className="font-semibold text-red-500">{helperValue}</span>
        </p>
      )}
    </div>
  );
}

function BankIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className={className}
      aria-hidden="true"
    >
      <path d="M3 10.5 12 4l9 6.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10.5V19M9.5 10.5V19M14.5 10.5V19M19 10.5V19" strokeLinecap="round" />
      <path d="M3 19h18" strokeLinecap="round" />
    </svg>
  );
}
