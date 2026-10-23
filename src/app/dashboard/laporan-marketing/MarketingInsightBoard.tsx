"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Check, ChevronDown, List, Loader2, Palette, Pencil, Plus, Table2, Trash2, X } from "lucide-react";
import {
  currentPeriodWib,
  INSIGHT_COLOR_BG,
  INSIGHT_COLORS,
  makeLocalId,
  monthDates,
  parseInsightNumber,
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
  const [colorCell, setColorCell] = useState<string | null>(null);
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

  const deleteColumn = (colId: string) =>
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

  const paintCell = (rowId: string, colId: string, color: string | null) => {
    upsertRow(rowId, (r) => {
      const colors = { ...(r.colors || {}) };
      if (color) colors[colId] = color;
      else delete colors[colId];
      return { ...r, colors };
    });
    setColorCell(null);
  };

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
                    {sheets.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setActiveId(s.id);
                          setDropdownOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-left transition-colors ${s.id === activeId ? "bg-violet-50 text-violet-700 font-semibold" : "text-gray-700 hover:bg-gray-50"}`}
                      >
                        <Table2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{s.name}</span>
                      </button>
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm ring-1 ring-gray-50 overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900 capitalize">{isDaily ? monthLabel : active.name}</h2>
            <span className="text-[11px] text-gray-400">
              {isDaily ? `${dates.length} hari · total otomatis` : `${active.rows.length} baris`} · klik titik di pojok sel untuk warnai
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="sticky left-0 z-10 bg-violet-600 text-white border border-violet-700 px-2 py-2 text-left font-bold min-w-[84px]">
                    {isDaily ? "Tanggal" : "#"}
                  </th>
                  {active.columns.map((col) => (
                    <th key={col.id} className="border border-gray-200 px-1 py-1 min-w-[120px]">
                      <div className="flex items-center gap-0.5">
                        <input
                          value={col.name}
                          onChange={(e) => renameColumn(col.id, e.target.value)}
                          className="flex-1 min-w-0 px-1.5 py-0.5 rounded-md bg-transparent border border-transparent hover:border-gray-200 focus:border-violet-300 focus:bg-white outline-none text-[11px] font-bold text-gray-700"
                          placeholder="Nama kolom"
                        />
                        <button
                          onClick={() => deleteColumn(col.id)}
                          title="Hapus kolom"
                          className="shrink-0 w-5 h-5 flex items-center justify-center rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </th>
                  ))}
                  <th className="w-10 border border-gray-200 px-1 py-1">
                    <button
                      onClick={addColumn}
                      title="Tambah kolom"
                      className="w-7 h-7 mx-auto flex items-center justify-center rounded-lg text-violet-600 hover:bg-violet-50 border border-dashed border-violet-200"
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
                  displayRows.map((dr) => {
                    const row = rowMap.get(dr.id);
                    return (
                      <tr key={dr.id} className="group hover:bg-violet-50/20">
                        <td className={`sticky left-0 z-[1] border border-gray-200 px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap ${dr.weekend ? "bg-gray-50" : "bg-white"} group-hover:bg-violet-50 relative`}>
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
                        {active.columns.map((col) => {
                          const cellKey = `${dr.id}:${col.id}`;
                          const color = row?.colors?.[col.id];
                          return (
                            <td key={col.id} className={`relative border border-gray-200 p-0 ${color ? INSIGHT_COLOR_BG[color] : ""}`}>
                              <input
                                value={row?.cells[col.id] ?? ""}
                                onChange={(e) => setCell(dr.id, col.id, e.target.value)}
                                className="w-full px-2 py-1.5 bg-transparent outline-none focus:bg-white/60 text-gray-800 tabular-nums"
                              />
                              <button
                                onClick={() => setColorCell((v) => (v === cellKey ? null : cellKey))}
                                title="Warnai sel"
                                className={`absolute top-0.5 right-0.5 w-4 h-4 rounded-full border border-white shadow-sm transition-opacity ${colorCell === cellKey ? "opacity-100" : "opacity-0 group-hover:opacity-100"} ${color ? INSIGHT_COLOR_BG[color] : "bg-gray-200"}`}
                              >
                                <Palette className="w-2.5 h-2.5 text-gray-500 mx-auto" />
                              </button>
                              {colorCell === cellKey && (
                                <>
                                  <div className="fixed inset-0 z-20" onClick={() => setColorCell(null)} />
                                  <div className="absolute z-30 top-6 right-0 flex items-center gap-1 p-1.5 rounded-xl bg-white border border-gray-100 shadow-xl ring-1 ring-gray-100">
                                    {INSIGHT_COLORS.map((c) => (
                                      <button
                                        key={c.key}
                                        onClick={() => paintCell(dr.id, col.id, c.key)}
                                        title={c.label}
                                        className={`w-5 h-5 rounded-full ${c.dot} ring-2 ${color === c.key ? "ring-gray-700" : "ring-transparent"} hover:scale-110 transition`}
                                      />
                                    ))}
                                    <button
                                      onClick={() => paintCell(dr.id, col.id, null)}
                                      title="Hapus warna"
                                      className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center text-gray-400 hover:text-red-500"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </td>
                          );
                        })}
                        <td className="border border-gray-200" />
                      </tr>
                    );
                  })
                )}
              </tbody>
              {displayRows.length > 0 && (
                <tfoot>
                  <tr className="bg-violet-50">
                    <td className="sticky left-0 z-[1] bg-violet-100 border border-violet-200 px-2 py-2 font-bold text-violet-800 text-[11px]">TOTAL</td>
                    {active.columns.map((col) => (
                      <td key={col.id} className="border border-violet-200 px-2 py-2 text-center font-bold tabular-nums text-violet-800">
                        {totals[col.id] || 0}
                      </td>
                    ))}
                    <td className="border border-violet-200" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Tombol + Baris hanya muncul di mode Manual */}
          {!isDaily && (
            <div className="px-3 py-2.5 border-t border-gray-100 bg-gray-50/50">
              <button
                onClick={addRowManual}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-semibold text-violet-600 bg-white border border-violet-200 hover:bg-violet-50"
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