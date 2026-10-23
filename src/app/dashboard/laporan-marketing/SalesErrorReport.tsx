"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Loader2, RefreshCw } from "lucide-react";
import {
  currentPeriodWib,
  monthDates,
  INSIGHT_COLORS,
  INSIGHT_COLOR_BG,
  INSIGHT_CELL_HEX,
} from "@/lib/marketing-insight";
import { todayWibDate } from "@/lib/marketing-report";

interface ErrRow {
  sales_name: string;
  total_lead: number;
  chat: number;
  salah: number;
  data: number;
  akun_device: string;
  catatan: string;
  colors: Record<string, string>;
}

// Kolom tabel. `key` dipakai juga sebagai key warna per sel.
const COLS = [
  { key: "akun_device", label: "Akun / Device", kind: "input", min: 180 },
  { key: "total_lead", label: "Total Lead", kind: "num", min: 90 },
  { key: "chat", label: "Chat Tidak Terbalas", kind: "num", min: 120 },
  { key: "salah", label: "Salah Input Keterangan", kind: "num", min: 130 },
  { key: "data", label: "Data Tidak Sesuai", kind: "num", min: 120 },
  { key: "total_temuan", label: "Total Temuan", kind: "temuan", min: 100 },
  { key: "status", label: "Status", kind: "status", min: 140 },
  { key: "catatan", label: "Catatan", kind: "input", min: 200 },
] as const;

function statusOf(total: number): { label: string; cls: string } {
  if (total === 0) return { label: "Tidak ada temuan", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
  if (total <= 10) return { label: "Perlu evaluasi", cls: "bg-amber-50 text-amber-700 ring-amber-200" };
  return { label: "Prioritas Audit", cls: "bg-red-50 text-red-700 ring-red-200" };
}

export default function SalesErrorReport() {
  const today = todayWibDate(); // YYYY-MM-DD
  const [period, setPeriod] = useState(() => currentPeriodWib()); // YYYY-MM
  const [day, setDay] = useState(() => Number(today.slice(8, 10)));
  const [rows, setRows] = useState<ErrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Seleksi warna (ala Excel)
  const [selStart, setSelStart] = useState<{ r: number; c: number } | null>(null);
  const [selEnd, setSelEnd] = useState<{ r: number; c: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const dates = useMemo(() => monthDates(period), [period]);
  const activeDate = useMemo(() => {
    const d = Math.min(day, dates.length || 31);
    return `${period}-${String(d).padStart(2, "0")}`;
  }, [period, day, dates.length]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`/api/sales-error-report?date=${activeDate}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal memuat");
      setRows(json.data as ErrRow[]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activeDate]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const up = () => setIsDragging(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);
  useEffect(() => { setSelStart(null); setSelEnd(null); }, [activeDate]);

  // Simpan meta (debounce per sales).
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveMeta = useCallback((salesName: string, patch: Partial<ErrRow>) => {
    setRows((prev) => prev.map((r) => (r.sales_name === salesName ? { ...r, ...patch } : r)));
    if (timers.current[salesName]) clearTimeout(timers.current[salesName]);
    timers.current[salesName] = setTimeout(async () => {
      try {
        const row = { ...(rows.find((r) => r.sales_name === salesName) || {}), ...patch } as ErrRow;
        await fetch(`/api/sales-error-report?date=${activeDate}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sales_name: salesName,
            akun_device: patch.akun_device ?? row.akun_device ?? "",
            catatan: patch.catatan ?? row.catatan ?? "",
            colors: patch.colors ?? row.colors ?? {},
          }),
        });
      } catch {
        setError("Gagal menyimpan catatan/warna");
      }
    }, 600);
  }, [activeDate, rows]);

  // ── Seleksi + warna ──
  const selRect = useMemo(() => {
    if (!selStart || !selEnd) return null;
    return {
      r1: Math.min(selStart.r, selEnd.r), r2: Math.max(selStart.r, selEnd.r),
      c1: Math.min(selStart.c, selEnd.c), c2: Math.max(selStart.c, selEnd.c),
    };
  }, [selStart, selEnd]);
  const inSel = (r: number, c: number) =>
    !!selRect && r >= selRect.r1 && r <= selRect.r2 && c >= selRect.c1 && c <= selRect.c2;
  const selCount = selRect ? (selRect.r2 - selRect.r1 + 1) * (selRect.c2 - selRect.c1 + 1) : 0;

  const startSel = (r: number, c: number) => { setSelStart({ r, c }); setSelEnd({ r, c }); setIsDragging(true); };
  const extendSel = (r: number, c: number) => {
    if (!isDragging) return;
    setSelEnd({ r, c });
    window.getSelection()?.removeAllRanges();
  };

  const paintSelection = (color: string | null) => {
    if (!selRect) return;
    for (let r = selRect.r1; r <= selRect.r2; r++) {
      const row = rows[r];
      if (!row) continue;
      const colors = { ...(row.colors || {}) };
      for (let c = selRect.c1; c <= selRect.c2; c++) {
        const key = COLS[c].key;
        if (color) colors[key] = color;
        else delete colors[key];
      }
      saveMeta(row.sales_name, { colors });
    }
  };

  const subtotal = useMemo(() => {
    const s = { total_lead: 0, chat: 0, salah: 0, data: 0, temuan: 0 };
    for (const r of rows) {
      s.total_lead += r.total_lead; s.chat += r.chat; s.salah += r.salah; s.data += r.data;
      s.temuan += r.chat + r.salah + r.data;
    }
    return s;
  }, [rows]);

  const monthLabel = useMemo(() => {
    const [y, m] = period.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  }, [period]);

  // ── Export Excel (bawa warna sel, status, subtotal) ──
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
        ws.addRow([
          i + 1, row.sales_name, row.akun_device || "",
          row.total_lead, row.chat, row.salah, row.data,
          temuan, statusOf(temuan).label, row.catatan || "",
        ]);
      });
      ws.addRow(["", "SUBTOTAL", "", subtotal.total_lead, subtotal.chat, subtotal.salah, subtotal.data, subtotal.temuan, "", ""]);

      const thin = { style: "thin" as const, color: { argb: "FFCBD5E1" } };
      const allBorders = { top: thin, bottom: thin, left: thin, right: thin };
      [6, 22, 22, 12, 16, 18, 16, 14, 18, 28].forEach((w, i) => (ws.getColumn(i + 1).width = w));
      ws.views = [{ state: "frozen", ySplit: 1 }];

      // Header biru
      const hr = ws.getRow(1);
      hr.height = 26;
      hr.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = allBorders;
      });

      // Baris data + warna manual + status berwarna
      const lastRow = ws.rowCount;
      for (let rIdx = 2; rIdx < lastRow; rIdx++) {
        const row = rows[rIdx - 2];
        const temuan = row.chat + row.salah + row.data;
        ws.getRow(rIdx).eachCell((cell, col) => {
          cell.border = allBorders;
          cell.alignment = {
            vertical: "middle",
            horizontal: col === 2 || col === 3 || col === 10 ? "left" : "center",
          };
          const colKey = COLS[col - 3]?.key; // col 3..10 → COLS 0..7
          const colorKey = colKey ? row.colors?.[colKey] : undefined;
          if (colorKey && INSIGHT_CELL_HEX[colorKey]) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + INSIGHT_CELL_HEX[colorKey] } };
          }
        });
        // Status (kolom 9) diwarnai sesuai tingkat temuan, kecuali sudah diwarnai manual
        if (!row.colors?.status) {
          const hex = temuan === 0 ? "FFDCFCE7" : temuan <= 10 ? "FFFEF3C7" : "FFFEE2E2";
          ws.getRow(rIdx).getCell(9).fill = { type: "pattern", pattern: "solid", fgColor: { argb: hex } };
        }
      }

      // Baris SUBTOTAL
      const sr = ws.getRow(lastRow);
      sr.height = 22;
      sr.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
        cell.font = { bold: true, color: { argb: "FF1E3A8A" } };
        cell.border = { ...allBorders, top: { style: "double", color: { argb: "FF1D4ED8" } } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Kesalahan Sales - ${activeDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError("Gagal export Excel: " + (e?.message || e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar: bulan + hari 1-31 */}
      <div className="rounded-3xl bg-white border border-gray-100 shadow-sm ring-1 ring-gray-50 px-4 py-3.5 sm:px-5 sm:py-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={period}
              onChange={(e) => e.target.value && setPeriod(e.target.value)}
              className="h-9 px-3 rounded-full bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-700 outline-none focus:border-violet-300"
            />
            <span className="text-sm font-bold text-gray-900 capitalize">{monthLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportExcel}
              disabled={exporting || rows.length === 0}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Export Excel
            </button>
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>
        {/* Tab hari 1..31 */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          <button onClick={() => setDay((d) => Math.max(1, d - 1))} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            <ChevronLeft className="w-4 h-4" />
          </button>
          {dates.map((d) => (
            <button
              key={d.id}
              onClick={() => setDay(d.day)}
              className={`shrink-0 min-w-[34px] h-8 px-1.5 rounded-lg text-xs font-semibold transition-colors ${
                d.day === Math.min(day, dates.length)
                  ? "bg-violet-600 text-white shadow-sm"
                  : d.isSunday ? "text-red-500 hover:bg-gray-100" : "text-gray-600 hover:bg-gray-100"
              }`}
              title={d.weekday}
            >
              {d.day}
            </button>
          ))}
          <button onClick={() => setDay((d) => Math.min(dates.length, d + 1))} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
        </p>
      )}

      {/* Toolbar warna */}
      {selRect && (
        <div className="rounded-2xl bg-violet-50/60 border border-violet-100 px-4 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-violet-700">{selCount} sel dipilih</span>
          <span className="text-gray-300">·</span>
          <span className="text-[11px] text-gray-500">Warnai:</span>
          <div className="flex items-center gap-1.5">
            {INSIGHT_COLORS.map((c) => (
              <button key={c.key} onClick={() => paintSelection(c.key)} title={c.label}
                className={`w-6 h-6 rounded-full ${c.dot} ring-2 ring-white shadow hover:scale-110 transition`} />
            ))}
            <button onClick={() => paintSelection(null)} title="Hapus warna"
              className="w-6 h-6 rounded-full border border-gray-300 bg-white flex items-center justify-center text-gray-400 hover:text-red-500 text-xs">✕</button>
          </div>
          <button onClick={() => { setSelStart(null); setSelEnd(null); }} className="ml-auto text-[11px] font-semibold text-gray-400 hover:text-gray-700">Batal pilih</button>
        </div>
      )}

      {/* Tabel */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-8 rounded bg-gray-100 animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">Belum ada sales yang menginput laporan pada tanggal ini.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className={`w-full text-xs border-collapse ${isDragging ? "select-none" : ""}`}>
              <thead>
                <tr className="bg-blue-700 text-white">
                  <th className="border border-blue-800 px-2 py-2 font-bold w-10">No</th>
                  <th className="border border-blue-800 px-3 py-2 font-bold text-left min-w-[130px]">Nama</th>
                  {COLS.map((col) => (
                    <th key={col.key} className="border border-blue-800 px-2 py-2 font-bold text-center" style={{ minWidth: col.min }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rIdx) => {
                  const temuan = row.chat + row.salah + row.data;
                  const st = statusOf(temuan);
                  return (
                    <tr key={row.sales_name} className="hover:bg-blue-50/30">
                      <td className="border border-gray-200 px-2 py-1.5 text-center text-gray-400 font-semibold">{rIdx + 1}</td>
                      <td className="border border-gray-200 px-3 py-1.5 font-semibold text-gray-800 whitespace-nowrap">{row.sales_name}</td>
                      {COLS.map((col, cIdx) => {
                        const color = row.colors?.[col.key];
                        const selected = inSel(rIdx, cIdx);
                        const cellCls = `relative border border-gray-200 p-0 ${color ? INSIGHT_COLOR_BG[color] : ""} ${selected ? "ring-2 ring-inset ring-violet-500/70 z-[1]" : ""}`;
                        return (
                          <td key={col.key} className={cellCls}
                            onMouseDown={() => startSel(rIdx, cIdx)} onMouseEnter={() => extendSel(rIdx, cIdx)}>
                            {col.kind === "input" ? (
                              <input
                                value={col.key === "akun_device" ? row.akun_device : row.catatan}
                                onChange={(e) => saveMeta(row.sales_name, { [col.key]: e.target.value } as Partial<ErrRow>)}
                                placeholder={col.key === "akun_device" ? "Laptop… (manual)" : "Catatan…"}
                                className="w-full px-2 py-1.5 bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-violet-300 text-gray-800"
                              />
                            ) : col.kind === "status" ? (
                              <div className="px-2 py-1.5 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ring-inset ${st.cls}`}>{st.label}</span>
                              </div>
                            ) : col.kind === "temuan" ? (
                              <div className={`px-2 py-1.5 text-center font-bold tabular-nums ${temuan > 10 ? "text-red-600" : temuan > 0 ? "text-amber-600" : "text-gray-400"}`}>{temuan}</div>
                            ) : (
                              <div className={`px-2 py-1.5 text-center tabular-nums ${col.key === "total_lead" ? "font-bold text-gray-800" : (row as any)[col.key] > 0 ? "font-semibold text-red-600" : "text-gray-300"}`}>
                                {(row as any)[col.key] || 0}
                              </div>
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
        Total Lead = laporan yang <b>disetujui</b> (bukan ditolak). Total Temuan: 0 = Tidak ada temuan · 1–10 = Perlu evaluasi · &gt;10 = Prioritas Audit.
      </p>
    </div>
  );
}