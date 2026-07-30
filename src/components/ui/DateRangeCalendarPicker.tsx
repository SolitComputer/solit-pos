"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const DAY_NAMES = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"];

interface DateRangeCalendarPickerProps {
  from: string; // format "yyyy-mm-dd" atau ""
  to: string;   // format "yyyy-mm-dd" atau ""
  onChange: (from: string, to: string) => void;
}

function toISO(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseISOYearMonth(value: string): { year: number; month: number } {
  const [y, m] = value.split("-").map(Number);
  return { year: y, month: (m || 1) - 1 };
}

function formatDisplay(value: string): string {
  if (!value) return "";
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" });
}

function getMonthMatrix(year: number, month: number): (number | null)[] {
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Minggu
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function DateRangeCalendarPicker({ from, to, onChange }: DateRangeCalendarPickerProps) {
  const [open, setOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const initial = from ? parseISOYearMonth(from) : { year: now.getFullYear(), month: now.getMonth() };
  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);

  // Tutup popover saat klik di luar area, atau saat tekan Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPendingStart(null);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); setPendingStart(null); }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const goPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const goNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  // Klik pertama = set tanggal awal. Klik kedua = set tanggal akhir,
  // langsung apply ke parent (onChange), lalu popover ditutup otomatis.
  const handleDayClick = (dateStr: string) => {
    if (pendingStart === null) {
      setPendingStart(dateStr);
      return;
    }
    let f = pendingStart;
    let t = dateStr;
    if (t < f) { const tmp = f; f = t; t = tmp; } // auto-swap kalau klik kedua < klik pertama
    onChange(f, t);
    setPendingStart(null);
    setOpen(false);
  };

  const todayISO = toISO(now.getFullYear(), now.getMonth(), now.getDate());

  // preview: kalau lagi milih (pendingStart ada), tampilkan preview sampai hoverDate.
  // kalau belum milih apa-apa, tampilkan range yang sudah tersimpan (from/to).
  const previewFrom = pendingStart ?? (from || null);
  const previewTo = pendingStart
    ? (hoverDate && hoverDate > pendingStart ? hoverDate : hoverDate && hoverDate < pendingStart ? hoverDate : pendingStart)
    : (to || null);

  const matrix = getMonthMatrix(viewYear, viewMonth);

  const label = from && to
    ? (from === to ? formatDisplay(from) : `${formatDisplay(from)} – ${formatDisplay(to)}`)
    : "Pilih Tanggal";

  return (
    <div className="relative flex-1" ref={containerRef}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 h-9 flex items-center gap-2 border border-gray-200 rounded-xl px-3 text-xs font-medium bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition"
        >
          <CalendarIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className={`truncate ${from ? "text-gray-700" : "text-gray-300"}`}>{label}</span>
        </button>
        {(from || to) && (
          <button
            type="button"
            onClick={() => onChange("", "")}
            className="w-8 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 border border-gray-200 transition flex-shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-30 mt-2 w-72 max-w-[85vw] left-0 bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={goPrevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-sm font-bold text-gray-900">{MONTH_NAMES[viewMonth]} {viewYear}</p>
            <button type="button" onClick={goNextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map((d) => (
              <div key={d} className="h-6 flex items-center justify-center text-[9px] font-bold text-gray-300">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {matrix.map((day, idx) => {
              if (day === null) return <div key={idx} className="h-9" />;
              const dateStr = toISO(viewYear, viewMonth, day);
              const isStart = previewFrom === dateStr;
              const isEnd = previewTo === dateStr;
              const isSingle = previewFrom === previewTo;
              const inRange = !!previewFrom && !!previewTo && dateStr > previewFrom && dateStr < previewTo;
              const isToday = dateStr === todayISO;

              let wrapperClass = "h-9 flex";
              if (inRange) wrapperClass += " bg-blue-50";
              if (isStart && !isSingle) wrapperClass += " bg-blue-50 rounded-l-full";
              if (isEnd && !isSingle) wrapperClass += " bg-blue-50 rounded-r-full";

              return (
                <div key={idx} className={wrapperClass}>
                  <button
                    type="button"
                    onClick={() => handleDayClick(dateStr)}
                    onMouseEnter={() => setHoverDate(dateStr)}
                    onMouseLeave={() => setHoverDate(null)}
                    className={`flex-1 flex items-center justify-center text-xs font-semibold rounded-full transition
                      ${isStart || isEnd ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}
                      ${isToday && !isStart && !isEnd ? "ring-1 ring-inset ring-gray-900/30" : ""}
                    `}
                  >
                    {day}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-3 mt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => { setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); }}
              className="text-[11px] font-semibold text-gray-500 hover:text-gray-900 transition"
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={() => { onChange("", ""); setPendingStart(null); setOpen(false); }}
              className="text-[11px] font-semibold text-red-500 hover:text-red-700 transition"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}