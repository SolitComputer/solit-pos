"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, AlertTriangle, CalendarDays, Check, ChevronDown, Download, GripVertical, List, Loader2, Pencil, Plus, Table2, Trash2, X } from "lucide-react";
import {
    currentPeriodWib,
    INSIGHT_ALIGN_CLASS,
    INSIGHT_CELL_HEX,
    INSIGHT_COLOR_BG,
    INSIGHT_COLORS,
    INSIGHT_HEADER_HEX,
    INSIGHT_HEADER_PALETTE,
    makeLocalId,
    monthDates,
    parseInsightNumber,
    type InsightAlign,
    type InsightRow,
    type InsightRowMode,
    type InsightSheet,
} from "@/lib/marketing-insight";

export default function MarketingInsightBoard() {
    const [sheets, setSheets] = useState<InsightSheet[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [dropdownOpen, setDropdownOpen] = useState(false);
    // Urutan tabel di dropdown — bisa di-drag naik/turun. Disimpan per-device di localStorage.
    const [sheetOrder, setSheetOrder] = useState<string[]>([]);
    const [dragId, setDragId] = useState<string | null>(null);
    // Seleksi rentang sel (ala Excel). Koordinat = index: r = index displayRows, c = index kolom.
    const [selStart, setSelStart] = useState<{ r: number; c: number } | null>(null);
    const [selEnd, setSelEnd] = useState<{ r: number; c: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    // Modal edit judul tabel (dipertahankan dari versi kamu)
    const [titleModalOpen, setTitleModalOpen] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");

    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const active = sheets.find((s) => s.id === activeId) ?? null;
    const isDaily = active?.row_mode === "daily";
    const effPeriod = active?.period || currentPeriodWib();

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError("");
            const res = await fetch("/api/marketing-insight", { cache: "no-store" });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Gagal memuat");
            const list = json.data as InsightSheet[];
            setSheets(list);
            setActiveId((prev) => prev ?? list[0]?.id ?? null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // Muat urutan dropdown dari localStorage (per-device).
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem("insightSheetOrder") || "null");
            if (Array.isArray(saved)) setSheetOrder(saved);
        } catch { }
    }, []);

    // Sheets diurutkan sesuai sheetOrder; tabel baru / tak dikenal ditaruh paling bawah.
    const orderedSheets = useMemo(() => {
        if (sheetOrder.length === 0) return sheets;
        const pos = new Map(sheetOrder.map((id, i) => [id, i] as const));
        return [...sheets].sort(
            (a, b) => (pos.get(a.id) ?? Infinity) - (pos.get(b.id) ?? Infinity)
        );
    }, [sheets, sheetOrder]);

    const handleSheetDrop = (targetId: string) => {
        if (!dragId || dragId === targetId) { setDragId(null); return; }
        const ids = orderedSheets.map((s) => s.id);
        const from = ids.indexOf(dragId);
        const to = ids.indexOf(targetId);
        if (from === -1 || to === -1) { setDragId(null); return; }
        ids.splice(from, 1);
        ids.splice(to, 0, dragId);
        setSheetOrder(ids);
        try { localStorage.setItem("insightSheetOrder", JSON.stringify(ids)); } catch { }
        setDragId(null);
    };

    // Autosave (debounce 600ms): kirim seluruh struktur sheet aktif.
    const scheduleSave = useCallback((sheet: InsightSheet) => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        setSaveState("saving");
        saveTimer.current = setTimeout(async () => {
            try {
                const res = await fetch(`/api/marketing-insight?id=${sheet.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: sheet.name,
                        period: sheet.period,
                        row_mode: sheet.row_mode,
                        columns: sheet.columns,
                        rows: sheet.rows,
                    }),
                });
                const json = await res.json();
                if (!res.ok || !json.success) throw new Error(json.message || "Gagal menyimpan");
                setSaveState("saved");
                setTimeout(() => setSaveState("idle"), 1500);
            } catch (e: any) {
                setError(e.message);
                setSaveState("error");
            }
        }, 600);
    }, []);

    const mutateActive = useCallback(
        (updater: (s: InsightSheet) => InsightSheet) => {
            setSheets((prev) => {
                const next = prev.map((s) => (s.id === activeId ? updater(s) : s));
                const updated = next.find((s) => s.id === activeId);
                if (updated) scheduleSave(updated);
                return next;
            });
        },
        [activeId, scheduleSave]
    );

    // ── Buat / hapus tabel ──
    const createSheet = async () => {
        const name = window.prompt("Nama tabel baru:", `Tabel ${sheets.length + 1}`);
        if (name === null) return;
        try {
            const res = await fetch("/api/marketing-insight", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim() || `Tabel ${sheets.length + 1}` }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Gagal membuat tabel");
            const created = json.data as InsightSheet;
            setSheets((prev) => [...prev, created]);
            setActiveId(created.id);
            setDropdownOpen(false);
        } catch (e: any) {
            setError(e.message);
        }
    };

    const deleteSheet = async (id: string) => {
        if (!window.confirm("Hapus tabel ini beserta seluruh isinya?")) return;
        try {
            const res = await fetch(`/api/marketing-insight?id=${id}`, { method: "DELETE" });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Gagal menghapus");
            setSheets((prev) => {
                const next = prev.filter((s) => s.id !== id);
                if (id === activeId) setActiveId(next[0]?.id ?? null);
                return next;
            });
        } catch (e: any) {
            setError(e.message);
        }
    };

    // ── Edit struktur / isi ──
    const renameSheet = (name: string) => mutateActive((s) => ({ ...s, name }));
    const setPeriod = (period: string) => mutateActive((s) => ({ ...s, period }));
    const setRowMode = (row_mode: InsightRowMode) => mutateActive((s) => ({ ...s, row_mode }));

    const addColumn = () =>
        mutateActive((s) => ({
            ...s,
            columns: [...s.columns, { id: makeLocalId("c"), name: `Kolom ${s.columns.length + 1}` }],
        }));

    const renameColumn = (colId: string, name: string) =>
        mutateActive((s) => ({ ...s, columns: s.columns.map((c) => (c.id === colId ? { ...c, name } : c)) }));

    // Set perataan SEMUA kolom sekaligus (kontrol global di header tabel).
    const setAllAlign = (align: InsightAlign) =>
        mutateActive((s) => ({ ...s, columns: s.columns.map((c) => ({ ...c, align })) }));

    // Export tabel aktif ke Excel (.xlsx) — bawa warna header & warna sel.
    const [exporting, setExporting] = useState(false);
    const exportExcel = async () => {
        if (!active) return;
        try {
            setExporting(true);
            const ExcelJS = (await import("exceljs")).default;
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet(active.name.slice(0, 31) || "Insight");

            const header = ["Tanggal", ...active.columns.map((c) => c.name || "")];
            ws.addRow(header);

            // Baris data (ikut mode harian / manual).
            for (const dr of displayRows) {
                const r = rowMap.get(dr.id);
                const label = isDaily ? `${dr.label} ${dr.sub ?? ""}`.trim() : dr.label;
                const cells = active.columns.map((c) => {
                    const raw = r?.cells[c.id] ?? "";
                    const num = parseInsightNumber(raw);
                    return raw !== "" && String(num) === raw.trim() ? num : raw; // angka → number, sisanya teks
                });
                ws.addRow([label, ...cells]);
            }

            // Baris TOTAL.
            ws.addRow(["TOTAL", ...active.columns.map((c) => totals[c.id] || 0)]);

            // ── Styling ──
            const alignMap: Record<string, "left" | "center" | "right"> = { left: "left", center: "center", right: "right" };
            const thin = { style: "thin" as const, color: { argb: "FFD1D5DB" } };
            const allBorders = { top: thin, bottom: thin, left: thin, right: thin };

            // Lebar kolom — WAJIB getColumn (ws.columns.forEach tidak reliabel di ExcelJS,
            // itu sebabnya dulu cuma kolom A & B yang dapat lebar).
            ws.getColumn(1).width = 16; // Tanggal
            for (let c = 2; c <= active.columns.length + 1; c++) ws.getColumn(c).width = 18;

            // Bekukan header + kolom tanggal, dan pasang filter di header.
            ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
            ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: active.columns.length + 1 } };

            // Header berwarna (argb WAJIB 8 hex "FF…" — 6 hex bikin alpha 00 = transparan).
            const headerRow = ws.getRow(1);
            headerRow.height = 26;
            headerRow.eachCell((cell, col) => {
                const hex = col === 1 ? "7C3AED" : INSIGHT_HEADER_HEX[(col - 2) % INSIGHT_HEADER_HEX.length];
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } };
                cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
                cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "center", wrapText: true };
                cell.border = allBorders;
            });

            // Sel data + warna penanda + shading halus akhir pekan.
            const lastRow = ws.rowCount; // baris TOTAL
            for (let rIdx = 2; rIdx < lastRow; rIdx++) {
                const dr = displayRows[rIdx - 2];
                const r = rowMap.get(dr?.id ?? "");
                const row = ws.getRow(rIdx);
                row.height = 18;
                row.eachCell((cell, col) => {
                    cell.border = allBorders;
                    cell.alignment = {
                        vertical: "middle",
                        horizontal: col === 1 ? "left" : alignMap[active.columns[col - 2]?.align ?? "left"],
                    };
                    if (col === 1) {
                        cell.font = { bold: true, color: { argb: dr?.sunday ? "FFDC2626" : "FF374151" }, size: 10 };
                        if (dr?.weekend) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
                    } else {
                        const c = active.columns[col - 2];
                        const colorKey = r?.colors?.[c?.id ?? ""];
                        if (colorKey && INSIGHT_CELL_HEX[colorKey]) {
                            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + INSIGHT_CELL_HEX[colorKey] } };
                        } else if (dr?.weekend) {
                            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBFBFC" } };
                        }
                    }
                });
            }

            // Baris TOTAL — kolom Tanggal ungu pekat, sisanya ungu muda, garis atas double.
            const totalRow = ws.getRow(lastRow);
            totalRow.height = 22;
            totalRow.eachCell((cell, col) => {
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col === 1 ? "FF7C3AED" : "FFEDE9FE" } };
                cell.font = { bold: true, color: { argb: col === 1 ? "FFFFFFFF" : "FF5B21B6" }, size: 11 };
                cell.alignment = {
                    vertical: "middle",
                    horizontal: col === 1 ? "left" : alignMap[active.columns[col - 2]?.align ?? "left"],
                };
                cell.border = { ...allBorders, top: { style: "double", color: { argb: "FF7C3AED" } } };
            });

            const buf = await wb.xlsx.writeBuffer();
            const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${active.name || "insight"}${isDaily ? ` - ${effPeriod}` : ""}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            setError("Gagal export Excel: " + (e?.message || e));
        } finally {
            setExporting(false);
        }
    };

    const deleteColumn = (colId: string) => {
        if (!active) return;
        // Cek apakah kolom ini punya isi di baris mana pun — kalau ada, minta konfirmasi.
        const colName = active.columns.find((c) => c.id === colId)?.name || "kolom ini";
        const filledCount = active.rows.reduce(
            (n, r) => n + ((r.cells[colId] ?? "").toString().trim() ? 1 : 0),
            0
        );
        const pesan =
            filledCount > 0
                ? `Hapus kolom "${colName}"? ${filledCount} sel sudah terisi dan akan ikut terhapus. Tindakan ini tidak bisa dibatalkan.`
                : `Hapus kolom "${colName}"?`;
        if (!window.confirm(pesan)) return; // user batal
        mutateActive((s) => ({
            ...s,
            columns: s.columns.filter((c) => c.id !== colId),
            rows: s.rows.map((r) => {
                const { [colId]: _c, ...cells } = r.cells;
                const colors = { ...(r.colors || {}) };
                delete colors[colId];
                return { ...r, cells, colors };
            }),
        }));
    };

    // Mode manual: baris bebas (id acak). Mode harian: baris upsert by tanggal.
    const addRowManual = () =>
        mutateActive((s) => ({ ...s, rows: [...s.rows, { id: makeLocalId("r"), cells: {} }] }));

    const deleteRow = (rowId: string) =>
        mutateActive((s) => ({ ...s, rows: s.rows.filter((r) => r.id !== rowId) }));

    const upsertRow = (rowId: string, apply: (r: InsightRow) => InsightRow) =>
        mutateActive((s) => {
            const rows = [...s.rows];
            const i = rows.findIndex((r) => r.id === rowId);
            if (i === -1) rows.push(apply({ id: rowId, cells: {} }));
            else rows[i] = apply(rows[i]);
            return { ...s, rows };
        });

    const setCell = (rowId: string, colId: string, value: string) =>
        upsertRow(rowId, (r) => ({ ...r, cells: { ...r.cells, [colId]: value } }));

    // Modal judul (punyamu — dipertahankan)
    const openTitleModal = () => {
        if (!active) return;
        setTitleDraft(active.name);
        setTitleModalOpen(true);
    };
    const saveTitleModal = () => {
        const name = titleDraft.trim();
        if (!name) return;
        renameSheet(name);
        setTitleModalOpen(false);
    };

    // ── Data turunan (mode harian) ──
    const dates = useMemo(() => (isDaily ? monthDates(effPeriod) : []), [isDaily, effPeriod]);
    const rowMap = useMemo(() => {
        const m = new Map<string, InsightRow>();
        active?.rows.forEach((r) => m.set(r.id, r));
        return m;
    }, [active]);

    // Baris yang digambar: mode harian → tanggal; mode manual → rows apa adanya.
    type DisplayRow = { id: string; label: string; sub?: string; weekend?: boolean; sunday?: boolean };
    const displayRows = useMemo<DisplayRow[]>(() => {
        if (!active) return [];
        if (isDaily) {
            return dates.map((d) => ({ id: d.id, label: String(d.day), sub: d.weekday, weekend: d.isWeekend, sunday: d.isSunday }));
        }
        return active.rows.map((r, i) => ({ id: r.id, label: String(i + 1) }));
    }, [active, isDaily, dates]);

    const totals = useMemo(() => {
        const t: Record<string, number> = {};
        if (!active) return t;
        for (const col of active.columns) {
            let sum = 0;
            for (const dr of displayRows) sum += parseInsightNumber(rowMap.get(dr.id)?.cells[col.id]);
            t[col.id] = sum;
        }
        return t;
    }, [active, displayRows, rowMap]);

    const monthLabel = useMemo(() => {
        const [y, m] = effPeriod.split("-").map(Number);
        return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
    }, [effPeriod]);

    // ── Seleksi rentang + ADS ──
    // Kuning (key "amber") = penanda ADS. Status ADS DITURUNKAN dari warna,
    // jadi otomatis sinkron & ikut tersimpan (tidak perlu kolom DB baru).
    const ADS_COLOR = "amber";

    // Akhiri drag saat mouse dilepas di mana pun.
    useEffect(() => {
        const up = () => setIsDragging(false);
        window.addEventListener("mouseup", up);
        return () => window.removeEventListener("mouseup", up);
    }, []);

    // Reset seleksi saat ganti tabel / bulan / mode (index bisa jadi tidak valid).
    useEffect(() => {
        setSelStart(null);
        setSelEnd(null);
    }, [activeId, effPeriod, isDaily]);

    const selRect = useMemo(() => {
        if (!selStart || !selEnd) return null;
        return {
            r1: Math.min(selStart.r, selEnd.r),
            r2: Math.max(selStart.r, selEnd.r),
            c1: Math.min(selStart.c, selEnd.c),
            c2: Math.max(selStart.c, selEnd.c),
        };
    }, [selStart, selEnd]);

    const inSelection = (r: number, c: number) =>
        !!selRect && r >= selRect.r1 && r <= selRect.r2 && c >= selRect.c1 && c <= selRect.c2;

    const selCount = selRect ? (selRect.r2 - selRect.r1 + 1) * (selRect.c2 - selRect.c1 + 1) : 0;

    const startSel = (r: number, c: number) => {
        setSelStart({ r, c });
        setSelEnd({ r, c });
        setIsDragging(true);
    };
    const extendSel = (r: number, c: number) => {
        if (!isDragging) return;
        setSelEnd({ r, c });
        window.getSelection()?.removeAllRanges(); // cegah blok teks browser saat drag
    };

    // Warnai SEMUA sel di rentang terpilih sekaligus (null = hapus warna → ADS ikut hilang).
    const paintSelection = (color: string | null) => {
        if (!active || !selRect) return;
        const rowIds = displayRows.slice(selRect.r1, selRect.r2 + 1).map((d) => d.id);
        const colIds = active.columns.slice(selRect.c1, selRect.c2 + 1).map((c) => c.id);
        mutateActive((s) => {
            const rows = [...s.rows];
            for (const rid of rowIds) {
                const idx = rows.findIndex((r) => r.id === rid);
                const base = idx === -1 ? { id: rid, cells: {}, colors: {} as Record<string, string> } : rows[idx];
                const colors = { ...(base.colors || {}) };
                for (const cid of colIds) {
                    if (color) colors[cid] = color;
                    else delete colors[cid];
                }
                const next = { ...base, colors };
                if (idx === -1) rows.push(next);
                else rows[idx] = next;
            }
            return { ...s, rows };
        });
    };

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="rounded-3xl bg-white border border-gray-100 shadow-sm ring-1 ring-gray-50 px-4 py-3.5 sm:px-5 sm:py-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        {/* Custom dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setDropdownOpen((v) => !v)}
                                className="inline-flex items-center gap-2 h-10 px-3.5 rounded-full bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-100 min-w-[180px] justify-between"
                            >
                                <span className="inline-flex items-center gap-2 min-w-0">
                                    <Table2 className="w-4 h-4 text-violet-500 shrink-0" />
                                    <span className="truncate">{active ? active.name : "Pilih tabel"}</span>
                                </span>
                                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                            </button>

                            {dropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                                    <div className="absolute z-20 mt-1.5 w-64 max-h-72 overflow-auto rounded-2xl bg-white border border-gray-100 shadow-xl ring-1 ring-gray-100 p-1.5">
                                        {sheets.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">Belum ada tabel</p>}
                                        {orderedSheets.map((s) => (
                                            <div
                                                key={s.id}
                                                draggable
                                                onDragStart={() => setDragId(s.id)}
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={() => handleSheetDrop(s.id)}
                                                onDragEnd={() => setDragId(null)}
                                                className={`group/item flex items-center gap-1 rounded-xl transition-colors ${dragId === s.id ? "opacity-50 ring-2 ring-violet-300" : ""} ${s.id === activeId ? "bg-violet-50" : "hover:bg-gray-50"}`}
                                            >
                                                <span
                                                    title="Tahan & geser untuk ubah urutan"
                                                    className="pl-2 py-2 text-gray-300 group-hover/item:text-gray-400 cursor-grab active:cursor-grabbing shrink-0"
                                                >
                                                    <GripVertical className="w-3.5 h-3.5" />
                                                </span>
                                                <button
                                                    onClick={() => {
                                                        setActiveId(s.id);
                                                        setDropdownOpen(false);
                                                    }}
                                                    className={`flex-1 min-w-0 flex items-center gap-2 pr-3 py-2 text-sm text-left ${s.id === activeId ? "text-violet-700 font-semibold" : "text-gray-700"}`}
                                                >
                                                    <Table2 className="w-3.5 h-3.5 shrink-0" />
                                                    <span className="truncate">{s.name}</span>
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            onClick={createSheet}
                                            className="w-full flex items-center gap-2 px-3 py-2 mt-1 rounded-xl text-sm font-semibold text-violet-600 hover:bg-violet-50 border-t border-gray-100"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Buat tabel baru
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        {active && (
                            <>
                                {/* Edit judul (modal) */}
                                <button
                                    onClick={openTitleModal}
                                    title="Edit judul tabel"
                                    className="inline-flex items-center justify-center h-10 w-10 rounded-full text-gray-400 border border-gray-200 hover:text-violet-600 hover:border-violet-200 hover:bg-violet-50 shrink-0"
                                >
                                    <Pencil className="w-4 h-4" />
                                </button>

                                {/* Toggle mode Harian / Manual */}
                                <div className="inline-flex items-center bg-gray-50 border border-gray-200 rounded-full p-0.5 h-10">
                                    <button
                                        onClick={() => setRowMode("daily")}
                                        className={`inline-flex items-center gap-1 px-3 h-9 rounded-full text-xs font-semibold ${isDaily ? "bg-violet-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                                    >
                                        <CalendarDays className="w-3.5 h-3.5" /> Harian
                                    </button>
                                    <button
                                        onClick={() => setRowMode("manual")}
                                        className={`inline-flex items-center gap-1 px-3 h-9 rounded-full text-xs font-semibold ${!isDaily ? "bg-violet-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                                    >
                                        <List className="w-3.5 h-3.5" /> Manual
                                    </button>
                                </div>

                                {/* Pemilih bulan (hanya mode harian) */}
                                {isDaily && (
                                    <input
                                        type="month"
                                        value={effPeriod}
                                        onChange={(e) => e.target.value && setPeriod(e.target.value)}
                                        title="Bulan tabel"
                                        className="h-10 px-3 rounded-full bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-700 outline-none focus:border-violet-300"
                                    />
                                )}
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] inline-flex items-center gap-1.5 text-gray-400 min-w-[90px] justify-end">
                            {saveState === "saving" && (<><Loader2 className="w-3 h-3 animate-spin" /> Menyimpan…</>)}
                            {saveState === "saved" && (<><Check className="w-3 h-3 text-emerald-500" /> Tersimpan</>)}
                            {saveState === "error" && (<><AlertTriangle className="w-3 h-3 text-red-500" /> Gagal</>)}
                        </span>
                        <button
                            onClick={createSheet}
                            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full text-sm font-semibold bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-sm shadow-violet-300/40 hover:opacity-95"
                        >
                            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Tabel Baru</span>
                        </button>
                        {active && (
                            <button
                                onClick={() => deleteSheet(active.id)}
                                title="Hapus tabel"
                                className="inline-flex items-center justify-center h-10 w-10 rounded-full text-gray-400 border border-gray-200 hover:text-red-600 hover:border-red-200 hover:bg-red-50"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {error && (
                <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
                </p>
            )}

            {loading ? (
                <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => (<div key={i} className="h-9 rounded-lg bg-gray-100 animate-pulse" />))}
                </div>
            ) : !active ? (
                <div className="py-16 flex flex-col items-center text-center">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 flex items-center justify-center mb-3 ring-1 ring-violet-100/60">
                        <Table2 className="w-6 h-6 text-violet-300" />
                    </div>
                    <p className="text-sm font-medium text-gray-700">Belum ada tabel insight</p>
                    <p className="text-xs text-gray-400 mt-1 max-w-[300px]">
                        Buat tabel, pilih mode Harian (baris tanggal otomatis) atau Manual (baris bebas), lalu isi seperti Excel.
                    </p>
                    <button onClick={createSheet} className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700">
                        <Plus className="w-4 h-4" /> Buat tabel baru
                    </button>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    {/* Header kartu: judul + align global + export */}
                    <div className="px-4 sm:px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-violet-50/60 to-fuchsia-50/40 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0">
                            <h2 className="text-sm font-bold text-gray-900 capitalize">{isDaily ? monthLabel : active.name}</h2>
                            <div className="inline-flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg p-0.5 shadow-sm">
                                {([
                                    { key: "left" as const, Icon: AlignLeft, title: "Rata kiri semua kolom" },
                                    { key: "center" as const, Icon: AlignCenter, title: "Rata tengah semua kolom" },
                                    { key: "right" as const, Icon: AlignRight, title: "Rata kanan semua kolom" },
                                ]).map(({ key, Icon, title }) => {
                                    const allActive = active.columns.length > 0 && active.columns.every((c) => (c.align ?? "left") === key);
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => setAllAlign(key)}
                                            title={title}
                                            className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${allActive ? "bg-violet-600 text-white shadow-sm" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"}`}
                                        >
                                            <Icon className="w-3.5 h-3.5" />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] text-gray-400 hidden sm:inline">
                                {isDaily ? `${dates.length} hari · total otomatis` : `${active.rows.length} baris`}
                            </span>
                            <button
                                onClick={exportExcel}
                                disabled={exporting}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                            >
                                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                Export Excel
                            </button>
                        </div>
                    </div>

                    {/* Toolbar warna untuk sel/blok terpilih — kuning = ADS */}
                    {selRect && (
                        <div className="px-4 sm:px-5 py-2 border-b border-violet-100 bg-violet-50/60 flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-semibold text-violet-700">{selCount} sel dipilih</span>
                            <span className="text-gray-300">·</span>
                            <span className="text-[11px] text-gray-500">Warnai:</span>
                            <div className="flex items-center gap-1.5">
                                {INSIGHT_COLORS.map((c) => (
                                    <button
                                        key={c.key}
                                        onClick={() => paintSelection(c.key)}
                                        title={c.key === ADS_COLOR ? "Kuning = tandai ADS" : c.label}
                                        className={`relative w-6 h-6 rounded-full ${c.dot} ring-2 ring-white shadow hover:scale-110 transition`}
                                    >
                                        {c.key === ADS_COLOR && (
                                            <span className="absolute -top-1.5 -right-1.5 px-0.5 text-[7px] font-extrabold leading-none rounded bg-amber-600 text-white">
                                                ADS
                                            </span>
                                        )}
                                    </button>
                                ))}
                                <button
                                    onClick={() => paintSelection(null)}
                                    title="Hapus warna (ADS ikut terhapus)"
                                    className="w-6 h-6 rounded-full border border-gray-300 bg-white flex items-center justify-center text-gray-400 hover:text-red-500"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <button
                                onClick={() => { setSelStart(null); setSelEnd(null); }}
                                className="ml-auto text-[11px] font-semibold text-gray-400 hover:text-gray-700"
                            >
                                Batal pilih
                            </button>
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className={`text-[11px] border-collapse ${isDragging ? "select-none" : ""}`} style={{ minWidth: "max-content" }}>
                            <thead>
                                <tr>
                                    <th className="sticky left-0 z-10 bg-violet-700 text-white border-r border-violet-800 px-2.5 py-1.5 text-left font-bold min-w-[72px]">
                                        {isDaily ? "Tanggal" : "#"}
                                    </th>
                                    {active.columns.map((col, i) => (
                                        <th
                                            key={col.id}
                                            className={`${INSIGHT_HEADER_PALETTE[i % INSIGHT_HEADER_PALETTE.length]} text-white border-l border-white/20 px-1.5 py-1.5 min-w-[96px] max-w-[160px]`}
                                        >
                                            <div className="flex items-center gap-0.5">
                                                <input
                                                    value={col.name}
                                                    onChange={(e) => renameColumn(col.id, e.target.value)}
                                                    className={`flex-1 min-w-0 px-1 py-0.5 rounded bg-transparent border border-transparent hover:border-white/40 focus:border-white focus:bg-white/15 outline-none text-[11px] font-bold text-white placeholder-white/60 ${INSIGHT_ALIGN_CLASS[col.align ?? "left"]}`}
                                                    placeholder="Kolom"
                                                />
                                                <button
                                                    onClick={() => deleteColumn(col.id)}
                                                    title="Hapus kolom"
                                                    className="shrink-0 w-4 h-4 flex items-center justify-center rounded text-white/60 hover:text-white hover:bg-white/20"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </th>
                                    ))}
                                    <th className="bg-gray-100 border-l border-gray-200 px-1 py-1 w-9">
                                        <button
                                            onClick={addColumn}
                                            title="Tambah kolom"
                                            className="w-6 h-6 mx-auto flex items-center justify-center rounded text-violet-600 hover:bg-violet-100 border border-dashed border-violet-300"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                        </button>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={active.columns.length + 2} className="border border-gray-200 px-4 py-6 text-center text-gray-400">
                                            {isDaily ? "Pilih bulan di atas." : "Belum ada baris. Klik “+ Baris” di bawah."}
                                        </td>
                                    </tr>
                                ) : (
                                    displayRows.map((dr, rIdx) => {
                                        const row = rowMap.get(dr.id);
                                        return (
                                            <tr key={dr.id} className="group hover:bg-violet-50/40">
                                                <td className={`sticky left-0 z-[1] border-r border-b border-gray-200 px-2.5 py-1 font-semibold whitespace-nowrap ${dr.weekend ? "bg-gray-50" : "bg-white"} group-hover:bg-violet-50 relative`}>
                                                    {isDaily ? (
                                                        <>
                                                            <span className={dr.sunday ? "text-red-500" : "text-gray-700"}>{dr.label}</span>
                                                            <span className="text-gray-400 font-normal ml-1">{dr.sub}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="group-hover:hidden text-gray-400">{dr.label}</span>
                                                            <button
                                                                onClick={() => deleteRow(dr.id)}
                                                                title="Hapus baris"
                                                                className="hidden group-hover:flex items-center justify-center w-full h-full text-gray-300 hover:text-red-500 absolute inset-0"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        </>
                                                    )}
                                                </td>
                                                {active.columns.map((col, cIdx) => {
                                                    const color = row?.colors?.[col.id];
                                                    const isAds = color === ADS_COLOR;
                                                    const selected = inSelection(rIdx, cIdx);
                                                    return (
                                                        <td
                                                            key={col.id}
                                                            onMouseDown={() => startSel(rIdx, cIdx)}
                                                            onMouseEnter={() => extendSel(rIdx, cIdx)}
                                                            className={`relative border-b border-l border-gray-100 p-0 ${color ? INSIGHT_COLOR_BG[color] : ""} ${selected ? "ring-2 ring-inset ring-violet-500/70 z-[1]" : ""}`}
                                                        >
                                                            {isAds && (
                                                                <span className="pointer-events-none absolute top-0 right-0 z-[1] px-1 text-[8px] font-extrabold leading-none rounded-bl bg-amber-500 text-white shadow-sm">
                                                                    ADS
                                                                </span>
                                                            )}
                                                            <input
                                                                value={row?.cells[col.id] ?? ""}
                                                                onChange={(e) => setCell(dr.id, col.id, e.target.value)}
                                                                className={`w-full px-1.5 py-1 bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-violet-300 text-gray-800 tabular-nums ${INSIGHT_ALIGN_CLASS[col.align ?? "left"]}`}
                                                            />
                                                        </td>
                                                    );
                                                })}
                                                <td className="border-b border-l border-gray-100 bg-gray-50/30" />
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                            {displayRows.length > 0 && (
                                <tfoot>
                                    <tr>
                                        <td className="sticky left-0 z-[1] bg-violet-700 text-white border-r border-violet-800 px-2.5 py-1.5 font-bold text-[11px]">TOTAL</td>
                                        {active.columns.map((col) => (
                                            <td key={col.id} className={`bg-violet-100 border-l border-violet-200 px-1.5 py-1.5 font-bold tabular-nums text-violet-800 ${INSIGHT_ALIGN_CLASS[col.align ?? "left"]}`}>
                                                {totals[col.id] || 0}
                                            </td>
                                        ))}
                                        <td className="bg-violet-50 border-l border-violet-200" />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>

                    {!isDaily && (
                        <div className="px-3 py-2.5 border-t border-gray-100 bg-gray-50/50">
                            <button
                                onClick={addRowManual}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold text-violet-600 bg-white border border-violet-200 hover:bg-violet-50"
                            >
                                <Plus className="w-3.5 h-3.5" /> Baris
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Modal edit judul tabel (dipertahankan dari versi kamu) */}
            {titleModalOpen && active && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setTitleModalOpen(false)} />
                    <div className="relative z-10 w-full max-w-sm rounded-3xl bg-white border border-gray-100 shadow-xl ring-1 ring-gray-100 p-5">
                        <div className="flex items-center gap-2.5 mb-4">
                            <span className="w-9 h-9 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center shrink-0 shadow-sm shadow-violet-300/40">
                                <Pencil className="w-4 h-4 text-white" />
                            </span>
                            <div className="min-w-0">
                                <h3 className="text-sm font-bold text-gray-900">Edit Judul Tabel</h3>
                                <p className="text-[11px] text-gray-400">Ubah nama tabel insight ini</p>
                            </div>
                        </div>
                        <input
                            autoFocus
                            value={titleDraft}
                            onChange={(e) => setTitleDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") saveTitleModal();
                                if (e.key === "Escape") setTitleModalOpen(false);
                            }}
                            placeholder="Nama tabel"
                            className="w-full h-11 px-3.5 rounded-xl bg-gray-50 border border-gray-200 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 focus:bg-white text-sm font-semibold text-gray-800"
                        />
                        <div className="flex items-center justify-end gap-2 mt-5">
                            <button onClick={() => setTitleModalOpen(false)} className="h-10 px-4 rounded-full text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200">
                                Batal
                            </button>
                            <button
                                onClick={saveTitleModal}
                                disabled={!titleDraft.trim()}
                                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-sm font-semibold bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-sm shadow-violet-300/40 hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Check className="w-4 h-4" /> Simpan
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}