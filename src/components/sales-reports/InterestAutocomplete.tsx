"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { Loader2 } from "lucide-react";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

interface InterestAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputClassName?: string;
}

// Autocomplete Minat (Laptop) dari riwayat laporan yang tersimpan di database.
// Sengaja tidak auto-fill inline: saran cuma tampil sebagai daftar, jadi
// mengetik teks baru tidak pernah "dibajak". Enter tetap submit form kecuali
// user sudah memilih saran pakai ↑/↓.
export default function InterestAutocomplete({
  value,
  onChange,
  placeholder,
  inputClassName,
}: InterestAutocompleteProps) {
  const listboxId = useId();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const query = value.trim();

  useEffect(() => {
    if (!open || query.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/sales-reports/interest-suggestions?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || "Gagal memuat saran");
        setSuggestions(Array.isArray(json.data) ? (json.data as string[]) : []);
        setActiveIndex(-1);
      } catch (err) {
        // Request dibatalkan karena user lanjut mengetik → abaikan.
        if ((err as Error).name !== "AbortError") setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  // Filter ulang di client supaya selama jeda debounce tidak ada saran basi
  // yang sudah tidak cocok, dan sembunyikan saran yang persis sama dengan input.
  const lowerQuery = query.toLowerCase();
  const visible = suggestions.filter((s) => {
    const lower = s.toLowerCase();
    return lower.includes(lowerQuery) && lower !== lowerQuery;
  });
  const showList = open && query.length >= MIN_QUERY_LENGTH && visible.length > 0;
  const safeActive = activeIndex < visible.length ? activeIndex : -1;

  const selectSuggestion = (suggestion: string) => {
    onChange(suggestion);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showList) {
      if (e.key === "ArrowDown" && query.length >= MIN_QUERY_LENGTH) setOpen(true);
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % visible.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? visible.length - 1 : i - 1));
        break;
      case "Enter":
        if (safeActive >= 0) {
          e.preventDefault(); // pilih saran, jangan submit form
          selectSuggestion(visible[safeActive]);
        }
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        break;
    }
  };

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-activedescendant={safeActive >= 0 ? `${listboxId}-opt-${safeActive}` : undefined}
        className={inputClassName}
      />

      {loading && open && (
        <Loader2 className="w-3.5 h-3.5 text-gray-300 animate-spin absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      )}

      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-20 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1"
        >
          <li role="presentation" className="px-3 pt-1 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            Riwayat minat
          </li>
          {visible.map((suggestion, i) => (
            <li
              key={suggestion}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={i === safeActive}
              title={suggestion}
              // preventDefault di mousedown supaya input tidak blur duluan
              // (kalau blur, list tertutup sebelum klik sempat diproses).
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(suggestion)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`px-3 py-2 text-sm cursor-pointer truncate transition-colors ${
                i === safeActive ? "bg-violet-50 text-gray-900" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <HighlightMatch text={suggestion} query={query} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (!query || idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-violet-700">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}