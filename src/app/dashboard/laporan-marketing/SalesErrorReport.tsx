"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Loader2, Plus, RefreshCw, Search, UserPlus, X } from "lucide-react";
import {
  currentPeriodWib,
  monthDates,
  INSIGHT_COLORS,
  INSIGHT_COLOR_BG,
  INSIGHT_CELL_HEX,
} from "@/lib/marketing-insight";
import { todayWibDate } from "@/lib/marketing-report";

type Counts = { total_lead: number; chat: number; salah: number; data: number };
type Meta = { catatan: string; colors: Record<string, string>; chat: number };
type Member = { user_id: string; nama: string };
type AvailUser = { id: string; name: string };

// Kolom data (setelah Nama). `key` = key warna per sel.
const COLS = [
  { key: "akun_device", label: "Akun / Device", kind: "akun", min: 180 },
  { key: "total_lead", label: "Total Lead", kind: "num", min: 90 },
  { key: "chat", label: "Chat Tidak Terbalas", kind: "chat_manual", min: 120 },
  { key: "salah", label: "Salah Input Keterangan", kind: "num", min: 130 },
  { key: "data", label: "Data Tidak Sesuai", kind: "num", min: 120 },
  { key: "total_temuan", label: "Total Temuan", kind: "temuan", min: 100 },
  { key: "status", label: "Status", kind: "status", min: 140 },
  { key: "catatan", label: "Catatan", kind: "catatan", min: 200 },
] as const;

// Kolom yang bisa diblok/warnai: Nama (index 0) + semua COLS (index 1..).
const COLOR_KEYS = ["nama", ...COLS.map((c) => c.key)];

function statusOf(total: number): { label: string; cls: string } {
  if (total === 0) return { label: "Tidak ada temuan", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
  if (total <= 10) return { label: "Perlu evaluasi", cls: "bg-amber-50 text-amber-700 ring-amber-200" };
  return { label: "Prioritas Audit", cls: "bg-red-50 text-red-700 ring-red-200" };
}

type ViewMode = "hari" | "minggu" | "bulan";
const pad2 = (n: number) => String(n).padStart(2, "0");

// "2026-10-22" → "22 Okt 2026". Parse manual biar tidak geser hari karena zona waktu.
function fmtShort(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

// Rentang Senin–Minggu yang memuat tanggal terpilih, DIKUNCI dalam bulan yang
// sama (konsisten dgn picker bulan — minggu di awal/akhir bisa parsial).
function weekRange(dateStr: string): { from: string; to: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0=Min .. 6=Sab
  const offset = (dow + 6) % 7;               // jarak mundur ke Senin (Senin=0)
  const monBase = d - offset;                 // tanggal Senin (bisa < 1)
  const monthLast = new Date(y, m, 0).getDate();
  const fromD = Math.max(1, monBase);
  const toD = Math.min(monthLast, monBase + 6);
  return { from: `${y}-${pad2(m)}-${pad2(fromD)}`, to: `${y}-${pad2(m)}-${pad2(toD)}` };
}

// Rentang 1 bulan penuh dari "YYYY-MM".
function monthRange(period: string): { from: string; to: string } {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${period}-01`, to: `${period}-${pad2(last)}` };
}

export default function SalesErrorReport() {
  const today = todayWibDate();
  const [period, setPeriod] = useState(() => currentPeriodWib());
  const [day, setDay] = useState(() => Number(today.slice(8, 10)));
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [akun, setAkun] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<Record<string, Meta>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Mode tampilan: per hari (default, editable) / per minggu / per bulan (agregat, read-only).
  const [viewMode, setViewMode] = useState<ViewMode>("hari");

  // Daftar sales (dari DB) + daftar sales aktif yang belum masuk (buat popup).
  const [members, setMembers] = useState<Member[]>([]);
  const [available, setAvailable] = useState<AvailUser[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);

  const [selStart, setSelStart] = useState<{ r: number; c: number } | null>(null);
  const [selEnd, setSelEnd] = useState<{ r: number; c: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Sortir ala Excel — klik header: A–Z, klik lagi Z–A. null = urutan daftar asli.
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const toggleSort = (key: string) => {
    setSelStart(null); setSelEnd(null); // reset seleksi warna biar index tidak meleset
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(key); setSortDir("asc"); }
  };

  const metaRef = useRef(meta);
  useEffect(() => { metaRef.current = meta; }, [meta]);

  const dates = useMemo(() => monthDates(period), [period]);
  const activeDate = useMemo(() => {
    const d = Math.min(day, dates.length || 31);
    return `${period}-${String(d).padStart(2, "0")}`;
  }, [period, day, dates.length]);

  // Rentang efektif sesuai mode: hari = 1 tgl; minggu = Senin–Minggu dari tgl
  // aktif; bulan = 1 bulan penuh.
  const range = useMemo(() => {
    if (viewMode === "bulan") return monthRange(period);
    if (viewMode === "minggu") return weekRange(activeDate);
    return { from: activeDate, to: activeDate };
  }, [viewMode, period, activeDate]);

  // Mode agregat (minggu/bulan) read-only: tidak bisa edit sel, warnai, atau hapus.
  const readOnly = viewMode !== "hari";
  const rangeLabel = viewMode === "hari" ? fmtShort(range.from) : `${fmtShort(range.from)} – ${fmtShort(range.to)}`;

  // ── Daftar sales (tidak tergantung tanggal) ──
  const loadMembers = useCallback(async () => {
    try {
      setMembersLoading(true);
      const res = await fetch("/api/sales-error-members", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal memuat daftar sales");
      setMembers(json.data.members || []);
      setAvailable(json.data.available || []);
    } catch (e: any) { setError(e.message); } finally { setMembersLoading(false); }
  }, []);
  useEffect(() => { loadMembers(); }, [loadMembers]);

  const addMember = async (user_id: string) => {
    try {
      setAddingId(user_id);
      const res = await fetch("/api/sales-error-members", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal menambah sales");
      await loadMembers();
    } catch (e: any) { setError(e.message); } finally { setAddingId(null); }
  };

  const removeMember = async (user_id: string, nama: string) => {
    if (!window.confirm(`Keluarkan ${nama} dari daftar Kesalahan Sales?`)) return;
    try {
      const res = await fetch(`/api/sales-error-members?user_id=${user_id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal menghapus");
      await loadMembers();
    } catch (e: any) { setError(e.message); }
  };

  const availableFiltered = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    return q ? available.filter((u) => u.name.toLowerCase().includes(q)) : available;
  }, [available, addSearch]);

  // ── Data per tanggal (counts/akun/meta) ──
  const load = useCallback(async () => {
    try {
      setLoading(true); setError("");
      // Per hari → ?date= (perilaku lama). Per minggu/bulan → ?from=&to= (agregat).
      const qs = viewMode === "hari"
        ? `date=${activeDate}`
        : `from=${range.from}&to=${range.to}`;
      const res = await fetch(`/api/sales-error-report?${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal memuat");
      setCounts(json.data.counts || {});
      setAkun(json.data.akun || {});
      setMeta(json.data.meta || {});
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [viewMode, activeDate, range.from, range.to]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const up = () => setIsDragging(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);
  useEffect(() => { setSelStart(null); setSelEnd(null); }, [activeDate, viewMode]);

  // Baris = daftar sales dari DB. Counts dicocokkan pakai user_id (filled_by).
  const rows = useMemo(() => {
    const base = members.map((m) => {
      const key = m.user_id;
      const c = counts[key];
      return {
        key,
        sales_name: m.nama,
        hasId: true,
        total_lead: c?.total_lead ?? 0,
        chat: meta[key]?.chat ?? 0,
        salah: c?.salah ?? 0,
        data: c?.data ?? 0,
        akun_device: akun[key] ?? "",
        catatan: meta[key]?.catatan ?? "",
        colors: meta[key]?.colors ?? {},
      };
    });
    if (!sortBy) return base;
    const val = (r: typeof base[number]): string | number => {
      if (sortBy === "nama") return r.sales_name.toLowerCase();
      if (sortBy === "total_temuan" || sortBy === "status") return r.chat + r.salah + r.data;
      if (sortBy === "akun_device" || sortBy === "catatan") return ((r as any)[sortBy] ?? "").toString().toLowerCase();
      return Number((r as any)[sortBy] ?? 0); // total_lead, chat, salah, data
    };
    return [...base].sort((a, b) => {
      const va = val(a), vb = val(b);
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb), "id");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [members, counts, akun, meta, sortBy, sortDir]);

  // ── Simpan (debounce per name+kind) ──
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const debounce = (key: string, fn: () => void, ms = 600) => {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, ms);
  };
  const saveAkun = (key: string, value: string) => {
    setAkun((a) => ({ ...a, [key]: value }));
    debounce(`akun:${key}`, () => {
      fetch(`/api/sales-error-report?date=${activeDate}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales_name: key, akun_device: value }),
      }).catch(() => setError("Gagal menyimpan Akun/Device"));
    });
  };
  const saveMetaCell = (key: string, patch: { catatan?: string; colors?: Record<string, string>; chat?: number }) => {
    const merged: Meta = {
      catatan: patch.catatan ?? metaRef.current[key]?.catatan ?? "",
      colors: patch.colors ?? metaRef.current[key]?.colors ?? {},
      chat: patch.chat ?? metaRef.current[key]?.chat ?? 0,
    };
    metaRef.current = { ...metaRef.current, [key]: merged };
    setMeta((m) => ({ ...m, [key]: merged }));
    debounce(`meta:${key}`, () => {
      fetch(`/api/sales-error-report?date=${activeDate}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales_name: key, catatan: merged.catatan, colors: merged.colors, chat: merged.chat }),
      }).catch(() => setError("Gagal menyimpan catatan/warna"));
    });
  };

  // ── Seleksi + warna (kolom 0 = Nama, 1.. = COLS) ──
  const selRect = useMemo(() => {
    if (!selStart || !selEnd) return null;
    return { r1: Math.min(selStart.r, selEnd.r), r2: Math.max(selStart.r, selEnd.r), c1: Math.min(selStart.c, selEnd.c), c2: Math.max(selStart.c, selEnd.c) };
  }, [selStart, selEnd]);
  const inSel = (r: number, c: number) => !!selRect && r >= selRect.r1 && r <= selRect.r2 && c >= selRect.c1 && c <= selRect.c2;
  const selCount = selRect ? (selRect.r2 - selRect.r1 + 1) * (selRect.c2 - selRect.c1 + 1) : 0;
  const startSel = (r: number, c: number) => { setSelStart({ r, c }); setSelEnd({ r, c }); setIsDragging(true); };
  const extendSel = (r: number, c: number) => { if (!isDragging) return; setSelEnd({ r, c }); window.getSelection()?.removeAllRanges(); };

  const paintSelection = (color: string | null) => {
    if (!selRect) return;
    for (let r = selRect.r1; r <= selRect.r2; r++) {
      const rowKey = rows[r]?.key;
      if (!rowKey) continue;
      const colors = { ...(metaRef.current[rowKey]?.colors ?? {}) };
      for (let c = selRect.c1; c <= selRect.c2; c++) {
        const ck = COLOR_KEYS[c];
        if (color) colors[ck] = color; else delete colors[ck];
      }
      saveMetaCell(rowKey, { colors });
    }
  };

  const subtotal = useMemo(() => {
    const s = { total_lead: 0, chat: 0, salah: 0, data: 0, temuan: 0 };
    for (const r of rows) { s.total_lead += r.total_lead; s.chat += r.chat; s.salah += r.salah; s.data += r.data; s.temuan += r.chat + r.salah + r.data; }
    return s;
  }, [rows]);

  const monthLabel = useMemo(() => {
    const [y, m] = period.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  }, [period]);

  // ── Export Excel ──
  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    if (rows.length === 0 || exporting) return;
    try {
      setExporting(true);
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Kesalahan Sales");
      ws.addRow(["No", "Nama", ...COLS.map((c) => c.label)]);
      rows.forEach((row, i) => {
        const temuan = row.chat + row.salah + row.data;
        ws.addRow([i + 1, row.sales_name, row.akun_device || "", row.total_lead, row.chat, row.salah, row.data, temuan, statusOf(temuan).label, row.catatan || ""]);
      });
      ws.addRow(["", "SUBTOTAL", "", subtotal.total_lead, subtotal.chat, subtotal.salah, subtotal.data, subtotal.temuan, "", ""]);

      const thin = { style: "thin" as const, color: { argb: "FFCBD5E1" } };
      const allBorders = { top: thin, bottom: thin, left: thin, right: thin };
      [6, 22, 22, 12, 16, 18, 16, 14, 18, 28].forEach((w, i) => (ws.getColumn(i + 1).width = w));
      ws.views = [{ state: "frozen", ySplit: 1 }];
      const hr = ws.getRow(1); hr.height = 26;
      hr.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = allBorders;
      });
      const lastRow = ws.rowCount;
      for (let rIdx = 2; rIdx < lastRow; rIdx++) {
        const row = rows[rIdx - 2];
        const temuan = row.chat + row.salah + row.data;
        ws.getRow(rIdx).eachCell((cell, col) => {
          cell.border = allBorders;
          cell.alignment = { vertical: "middle", horizontal: col === 2 || col === 3 || col === 10 ? "left" : "center" };
          const key = col === 2 ? "nama" : COLS[col - 3]?.key;
          const colorKey = key ? row.colors?.[key] : undefined;
          if (colorKey && INSIGHT_CELL_HEX[colorKey]) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + INSIGHT_CELL_HEX[colorKey] } };
        });
        if (!row.colors?.status) {
          const hex = temuan === 0 ? "FFDCFCE7" : temuan <= 10 ? "FFFEF3C7" : "FFFEE2E2";
          ws.getRow(rIdx).getCell(9).fill = { type: "pattern", pattern: "solid", fgColor: { argb: hex } };
        }
      }
      const sr = ws.getRow(lastRow); sr.height = 22;
      sr.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
        cell.font = { bold: true, color: { argb: "FF1E3A8A" } };
        cell.border = { ...allBorders, top: { style: "double", color: { argb: "FF1D4ED8" } } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
         const fileLabel = viewMode === "hari" ? activeDate : `${range.from} sd ${range.to}`;
      const a = document.createElement("a"); a.href = url; a.download = `Kesalahan Sales - ${fileLabel}.xlsx`; a.click();
      URL.revokeObjectURL(url);
      } catch (e: any) { setError("Gagal export Excel: " + (e?.message || e)); } finally { setExporting(false); }
  };

  const showSkeleton = loading || membersLoading;

  return (
    <div className="space-y-4">
      {/* Toolbar: bulan + hari 1-31 */}
      <div className="rounded-3xl bg-white border border-gray-100 shadow-sm ring-1 ring-gray-50 px-4 py-3.5 sm:px-5 sm:py-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)}
              className="h-9 px-3 rounded-full bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-700 outline-none focus:border-violet-300" />
            <span className="text-sm font-bold text-gray-900 capitalize">{monthLabel}</span>

            {/* Mode filter: Per Hari / Per Minggu / Per Bulan */}
            <div className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 p-0.5">
              {([["hari", "Per Hari"], ["minggu", "Per Minggu"], ["bulan", "Per Bulan"]] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${viewMode === mode ? "bg-violet-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-100">
              {rangeLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowAdd(true); setAddSearch(""); }}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-sm hover:opacity-95">
              <UserPlus className="w-3.5 h-3.5" /> Tambah Sales
            </button>
            <button onClick={exportExcel} disabled={exporting || rows.length === 0}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Export Excel
            </button>
            <button onClick={() => { load(); loadMembers(); }} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50">
              <RefreshCw className={`w-3.5 h-3.5 ${showSkeleton ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>
        {/* Picker hari — relevan untuk Per Hari & Per Minggu (menentukan minggu
            mana). Di Per Bulan disembunyikan karena seluruh bulan dihitung. */}
        {viewMode !== "bulan" && (
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            <button onClick={() => setDay((d) => Math.max(1, d - 1))} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><ChevronLeft className="w-4 h-4" /></button>
            {dates.map((d) => {
              const ymd = `${period}-${pad2(d.day)}`;
              const inWeek = viewMode === "minggu" && ymd >= range.from && ymd <= range.to;
              return (
                <button key={d.id} onClick={() => setDay(d.day)} title={d.weekday}
                  className={`shrink-0 min-w-[34px] h-8 px-1.5 rounded-lg text-xs font-semibold transition-colors ${d.day === Math.min(day, dates.length) ? "bg-violet-600 text-white shadow-sm" : inWeek ? "bg-violet-100 text-violet-700" : d.isSunday ? "text-red-500 hover:bg-gray-100" : "text-gray-600 hover:bg-gray-100"}`}>
                  {d.day}
                </button>
              );
            })}
            <button onClick={() => setDay((d) => Math.min(dates.length, d + 1))} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><ChevronRight className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}</p>
      )}

      {/* Toolbar warna */}
      {selRect && (
        <div className="rounded-2xl bg-violet-50/60 border border-violet-100 px-4 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-violet-700">{selCount} sel dipilih</span>
          <span className="text-gray-300">·</span>
          <span className="text-[11px] text-gray-500">Warnai:</span>
          <div className="flex items-center gap-1.5">
            {INSIGHT_COLORS.map((c) => (
              <button key={c.key} onClick={() => paintSelection(c.key)} title={c.label} className={`w-6 h-6 rounded-full ${c.dot} ring-2 ring-white shadow hover:scale-110 transition`} />
            ))}
            <button onClick={() => paintSelection(null)} title="Hapus warna" className="w-6 h-6 rounded-full border border-gray-300 bg-white flex items-center justify-center text-gray-400 hover:text-red-500 text-xs">✕</button>
          </div>
          <button onClick={() => { setSelStart(null); setSelEnd(null); }} className="ml-auto text-[11px] font-semibold text-gray-400 hover:text-gray-700">Batal pilih</button>
        </div>
      )}

      {/* Tabel */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {showSkeleton ? (
          <div className="p-4 space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-8 rounded bg-gray-100 animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="py-12 flex flex-col items-center text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center mb-3"><UserPlus className="w-5 h-5 text-violet-300" /></div>
            <p className="text-sm font-medium text-gray-700">Belum ada sales di daftar</p>
            <p className="text-xs text-gray-400 mt-1">Klik “Tambah Sales” untuk menambahkan.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={`w-full text-xs border-collapse ${isDragging ? "select-none" : ""}`}>
              <thead>
                <tr className="bg-blue-700 text-white">
                  <th className="border border-blue-800 px-2 py-2 font-bold w-10">No</th>
                  <th className="border border-blue-800 p-0 font-bold text-left min-w-[130px]">
                    <button type="button" onClick={() => toggleSort("nama")} className="w-full flex items-center gap-1 px-3 py-2 hover:bg-blue-800/40 transition-colors">
                      Nama <span className="text-[10px] opacity-80">{sortBy === "nama" ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
                    </button>
                  </th>
                  {COLS.map((col) => (
                    <th key={col.key} className="border border-blue-800 p-0 font-bold text-center" style={{ minWidth: col.min }}>
                      <button type="button" onClick={() => toggleSort(col.key)} className="w-full flex items-center justify-center gap-1 px-2 py-2 hover:bg-blue-800/40 transition-colors">
                        {col.label} <span className="text-[10px] opacity-80">{sortBy === col.key ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rIdx) => {
                  const temuan = row.chat + row.salah + row.data;
                  const st = statusOf(temuan);
                  const namaColor = row.colors?.["nama"];
                  const namaSelected = inSel(rIdx, 0);
                  return (
                    <tr key={row.key} className="group hover:bg-blue-50/30">
                      <td className="border border-gray-200 px-2 py-1.5 text-center text-gray-400 font-semibold">{rIdx + 1}</td>
                      <td
                        onMouseDown={readOnly ? undefined : () => startSel(rIdx, 0)}
                        onMouseEnter={readOnly ? undefined : () => extendSel(rIdx, 0)}
                        className={`border border-gray-200 px-3 py-1.5 font-semibold whitespace-nowrap text-gray-800 ${namaColor ? INSIGHT_COLOR_BG[namaColor] : ""} ${namaSelected ? "ring-2 ring-inset ring-violet-500/70" : ""}`}>
                        <div className="flex items-center justify-between gap-1">
                          <span>{row.sales_name}</span>
                          {!readOnly && (
                            <button
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={() => removeMember(row.key, row.sales_name)}
                              title="Keluarkan dari daftar"
                              className="opacity-0 group-hover:opacity-100 shrink-0 w-5 h-5 inline-flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition">
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      {COLS.map((col, cIdx) => {
                        const c = cIdx + 1;
                        const color = row.colors?.[col.key];
                        const selected = inSel(rIdx, c);
                        return (
                          <td key={col.key}
                            onMouseDown={readOnly ? undefined : () => startSel(rIdx, c)}
                            onMouseEnter={readOnly ? undefined : () => extendSel(rIdx, c)}
                            className={`relative border border-gray-200 p-0 ${color ? INSIGHT_COLOR_BG[color] : ""} ${selected ? "ring-2 ring-inset ring-violet-500/70 z-[1]" : ""}`}>
                            {col.kind === "akun" ? (
                              readOnly ? (
                                <div className="px-2 py-1.5 text-gray-800 truncate">{row.akun_device || "—"}</div>
                              ) : (
                                <input value={row.akun_device} onChange={(e) => saveAkun(row.key, e.target.value)}
                                  placeholder="Laptop… (global)" className="w-full px-2 py-1.5 bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-violet-300 text-gray-800" />
                              )
                            ) : col.kind === "catatan" ? (
                              readOnly ? (
                                <div className="px-2 py-1.5 text-gray-800 truncate">{row.catatan || "—"}</div>
                              ) : (
                                <input value={row.catatan} onChange={(e) => saveMetaCell(row.key, { catatan: e.target.value })}
                                  placeholder="Catatan…" className="w-full px-2 py-1.5 bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-violet-300 text-gray-800" />
                              )
                            ) : col.kind === "chat_manual" ? (
                              readOnly ? (
                                <div className={`px-2 py-1.5 text-center tabular-nums ${row.chat > 0 ? "font-semibold text-red-600" : "text-gray-400"}`}>{row.chat || 0}</div>
                              ) : (
                                <input
                                  type="number" min={0} inputMode="numeric"
                                  value={row.chat || ""}
                                  onChange={(e) => saveMetaCell(row.key, { chat: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
                                  placeholder="0"
                                  className={`w-full px-2 py-1.5 bg-transparent outline-none text-center tabular-nums focus:bg-white focus:ring-1 focus:ring-violet-300 ${row.chat > 0 ? "font-semibold text-red-600" : "text-gray-400"}`}
                                />
                              )
                            ) : col.kind === "status" ? (
                              <div className="px-2 py-1.5 text-center"><span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ring-inset ${st.cls}`}>{st.label}</span></div>
                            ) : col.kind === "temuan" ? (
                              <div className={`px-2 py-1.5 text-center font-bold tabular-nums ${temuan > 10 ? "text-red-600" : temuan > 0 ? "text-amber-600" : "text-gray-400"}`}>{temuan}</div>
                            ) : (
                              <div className={`px-2 py-1.5 text-center tabular-nums ${col.key === "total_lead" ? "font-bold text-gray-800" : (row as any)[col.key] > 0 ? "font-semibold text-red-600" : "text-gray-300"}`}>{(row as any)[col.key] || 0}</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-blue-50 font-bold text-blue-800">
                  <td className="border border-blue-200 px-2 py-2 text-center" colSpan={2}>SUBTOTAL</td>
                  <td className="border border-blue-200 px-2 py-2" />
                  <td className="border border-blue-200 px-2 py-2 text-center tabular-nums">{subtotal.total_lead}</td>
                  <td className="border border-blue-200 px-2 py-2 text-center tabular-nums">{subtotal.chat}</td>
                  <td className="border border-blue-200 px-2 py-2 text-center tabular-nums">{subtotal.salah}</td>
                  <td className="border border-blue-200 px-2 py-2 text-center tabular-nums">{subtotal.data}</td>
                  <td className="border border-blue-200 px-2 py-2 text-center tabular-nums">{subtotal.temuan}</td>
                  <td className="border border-blue-200 px-2 py-2" />
                  <td className="border border-blue-200 px-2 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-400 px-1">
        Daftar sales bisa <b>ditambah/dihapus</b> lewat tombol Tambah Sales (×). Akun/Device <b>global</b> (berlaku semua tanggal). <b>Chat Tidak Terbalas = isi manual</b> (per tanggal). Total Lead = laporan <b>disetujui</b>. Total Temuan: 0 = Tidak ada temuan · 1–10 = Perlu evaluasi · &gt;10 = Prioritas Audit.
      </p>

      {/* Popup Tambah Sales */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm" onClick={() => setShowAdd(false)}>
          <div className="relative w-full max-w-sm rounded-3xl bg-white border border-gray-100 shadow-xl p-5 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-9 h-9 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center shrink-0 shadow-sm"><UserPlus className="w-4 h-4 text-white" /></span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-gray-900">Tambah Sales</h3>
                <p className="text-[11px] text-gray-400">Pilih sales aktif untuk ditambahkan ke tabel.</p>
              </div>
              <button onClick={() => setShowAdd(false)} className="ml-auto w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input autoFocus value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder="Cari nama sales…"
                className="w-full pl-8 pr-3 h-10 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 focus:bg-white" />
            </div>
            <div className="overflow-y-auto -mx-1 px-1 space-y-1">
              {membersLoading ? (
                <p className="text-xs text-gray-400 text-center py-4">Memuat…</p>
              ) : availableFiltered.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">{available.length === 0 ? "Semua sales aktif sudah ada di daftar." : "Tidak ada yang cocok."}</p>
              ) : availableFiltered.map((u) => (
                <button key={u.id} disabled={addingId === u.id} onClick={() => addMember(u.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm text-left text-gray-700 bg-gray-50 border border-gray-200 hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50 transition-colors">
                  <span className="truncate">{u.name}</span>
                  {addingId === u.id ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Plus className="w-4 h-4 opacity-50 shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}