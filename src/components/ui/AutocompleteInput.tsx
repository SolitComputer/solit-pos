"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * Input teks dengan dropdown saran dari history input user.
 * Dipakai di form Tambah Unit (Data Barang) + QcEditModal (Team QC).
 *
 * Behavior:
 * - Saran di-fetch dari /api/suggestions?field=<name> sekali saat mount
 * - Dropdown muncul saat focus + filter sesuai yang diketik
 * - Klik saran → isi field + close dropdown
 * - Tombol × per saran → hide dari user ini (localStorage per-field per-user)
 * - Klik di luar input → close dropdown
 */
interface Props {
  // Identifier field untuk ambil saran dari API ('source', 'brand', dll).
  // Harus match salah satu key di FIELD_CONFIG di /api/suggestions.
  field: string;
  name?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  // Max saran yang ditampilkan di dropdown setelah filter (default 10)
  maxVisible?: number;
}

export default function AutocompleteInput({
  field, name, value, onChange, placeholder, className = "",
  autoFocus, disabled, maxVisible = 10,
}: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Load saran dari API + hidden list dari localStorage, sekali saat mount.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/suggestions?field=${encodeURIComponent(field)}`);
        const json = await res.json();
        if (active && json?.success) setSuggestions(json.data ?? []);
      } catch { /* ignore — kalau gagal, input tetap bisa dipakai manual */ }
    })();

    try {
      const raw = localStorage.getItem(`suggestions-hidden-${field}`);
      if (raw) setHidden(new Set(JSON.parse(raw)));
    } catch { /* localStorage disabled — hidden list jadi in-memory saja */ }

    return () => { active = false; };
  }, [field]);

  // Klik di luar wrapper → close dropdown.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const filtered = suggestions
    .filter(s => !hidden.has(s))
    .filter(s => s.toLowerCase().includes(value.trim().toLowerCase()))
    .slice(0, maxVisible);

  const hideOne = (s: string) => {
    const next = new Set(hidden);
    next.add(s);
    setHidden(next);
    try {
      localStorage.setItem(`suggestions-hidden-${field}`, JSON.stringify(Array.from(next)));
    } catch { /* ignore */ }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={className}
        autoFocus={autoFocus}
        disabled={disabled}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto z-50">
          {filtered.map(s => (
            <div
              key={s}
              className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer group"
              onMouseDown={(e) => {
                // onMouseDown instead of onClick supaya fire SEBELUM input blur,
                // sehingga dropdown tidak ter-close dulu sebelum isi field.
                e.preventDefault();
                onChange(s);
                setOpen(false);
              }}
            >
              <span className="text-sm text-gray-700 truncate flex-1">{s}</span>
              <button
                type="button"
                onMouseDown={(e) => {
                  // Stop propagation supaya klik × tidak memilih saran.
                  e.preventDefault();
                  e.stopPropagation();
                  hideOne(s);
                }}
                className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition"
                title="Hapus saran ini dari daftar (per-user)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}