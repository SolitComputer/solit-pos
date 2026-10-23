"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Loader2, Plus, Table2, Trash2, X } from "lucide-react";
import { makeLocalId, type InsightSheet } from "@/lib/marketing-insight";

export default function MarketingInsightBoard() {
  const [sheets, setSheets] = useState<InsightSheet[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = sheets.find((s) => s.id === activeId) ?? null;

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
          body: JSON.stringify({ name: sheet.name, columns: sheet.columns, rows: sheet.rows }),
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

  // Ubah sheet aktif di state lokal + jadwalkan simpan.
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

  // ── Edit struktur tabel (manual, ala Excel) ──
  const addColumn = () =>
    mutateActive((s) => ({
      ...s,
      columns: [...s.columns, { id: makeLocalId("c"), name: `Kolom ${s.columns.length + 1}` }],
    }));

  const renameColumn = (colId: string, name: string) =>
    mutateActive((s) => ({
      ...s,
      columns: s.columns.map((c) => (c.id === colId ? { ...c, name } : c)),
    }));

  const deleteColumn = (colId: string) =>
    mutateActive((s) => ({
      ...s,
      columns: s.columns.filter((c) => c.id !== colId),
      rows: s.rows.map((r) => {
        const { [colId]: _drop, ...rest } = r.cells;
        return { ...r, cells: rest };
      }),
    }));

  const addRow = () =>
    mutateActive((s) => ({ ...s, rows: [...s.rows, { id: makeLocalId("r"), cells: {} }] }));

  const deleteRow = (rowId: string) =>
    mutateActive((s) => ({ ...s, rows: s.rows.filter((r) => r.id !== rowId) }));

  const setCell = (rowId: string, colId: string, value: string) =>
    mutateActive((s) => ({
      ...s,
      rows: s.rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r)),
    }));

  const renameSheet = (name: string) => mutateActive((s) => ({ ...s, name }));

  return (
    <div className="space-y-4">
      {/* Toolbar: dropdown pilih/buat tabel + status simpan */}
      <div className="rounded-3xl bg-white border border-gray-100 shadow-sm ring-1 ring-gray-50 px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
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

            {/* Nama tabel (editable) */}
            {active && (
              <input
                value={active.name}
                onChange={(e) => renameSheet(e.target.value)}
                className="h-10 px-3 rounded-full bg-transparent border border-transparent hover:border-gray-200 focus:border-violet-300 focus:bg-white outline-none text-sm font-semibold text-gray-800 min-w-0 w-40 sm:w-56"
                placeholder="Nama tabel"
              />
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] inline-flex items-center gap-1.5 text-gray-400 min-w-[90px] justify-end">
              {saveState === "saving" && (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" /> Menyimpan…
                </>
              )}
              {saveState === "saved" && (
                <>
                  <Check className="w-3 h-3 text-emerald-500" /> Tersimpan
                </>
              )}
              {saveState === "error" && (
                <>
                  <AlertTriangle className="w-3 h-3 text-red-500" /> Gagal
                </>
              )}
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

      {/* Konten */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : !active ? (
        <div className="py-16 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 flex items-center justify-center mb-3 ring-1 ring-violet-100/60">
            <Table2 className="w-6 h-6 text-violet-300" />
          </div>
          <p className="text-sm font-medium text-gray-700">Belum ada tabel insight</p>
          <p className="text-xs text-gray-400 mt-1 max-w-[280px]">
            Buat tabel pertama, lalu tambah kolom &amp; baris sesuai kebutuhan — isinya manual seperti Excel.
          </p>
          <button
            onClick={createSheet}
            className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700"
          >
            <Plus className="w-4 h-4" /> Buat tabel baru
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm ring-1 ring-gray-50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="w-10 border border-gray-200 px-1 py-2 text-[11px] text-gray-400 font-semibold">#</th>
                  {active.columns.map((col) => (
                    <th key={col.id} className="border border-gray-200 px-1.5 py-1.5 min-w-[160px]">
                      <div className="flex items-center gap-1">
                        <input
                          value={col.name}
                          onChange={(e) => renameColumn(col.id, e.target.value)}
                          className="flex-1 min-w-0 px-2 py-1 rounded-md bg-transparent border border-transparent hover:border-gray-200 focus:border-violet-300 focus:bg-white outline-none text-xs font-bold text-gray-700"
                          placeholder="Nama kolom"
                        />
                        <button
                          onClick={() => deleteColumn(col.id)}
                          title="Hapus kolom"
                          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </th>
                  ))}
                  <th className="w-12 border border-gray-200 px-1 py-1.5">
                    <button
                      onClick={addColumn}
                      title="Tambah kolom"
                      className="w-8 h-8 mx-auto flex items-center justify-center rounded-lg text-violet-600 hover:bg-violet-50 border border-dashed border-violet-200"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {active.rows.length === 0 ? (
                  <tr>
                    <td colSpan={active.columns.length + 2} className="border border-gray-200 px-4 py-6 text-center text-xs text-gray-400">
                      Belum ada baris. Klik “+ Baris” di bawah.
                    </td>
                  </tr>
                ) : (
                  active.rows.map((row, idx) => (
                    <tr key={row.id} className="group hover:bg-violet-50/30">
                      <td className="border border-gray-200 text-center text-[11px] text-gray-400 relative">
                        <span className="group-hover:hidden">{idx + 1}</span>
                        <button
                          onClick={() => deleteRow(row.id)}
                          title="Hapus baris"
                          className="hidden group-hover:flex items-center justify-center w-full h-full text-gray-300 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                      {active.columns.map((col) => (
                        <td key={col.id} className="border border-gray-200 p-0">
                          <input
                            value={row.cells[col.id] ?? ""}
                            onChange={(e) => setCell(row.id, col.id, e.target.value)}
                            className="w-full px-2.5 py-2 bg-transparent outline-none focus:bg-violet-50/50 text-gray-800"
                          />
                        </td>
                      ))}
                      <td className="border border-gray-200" />
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2.5 border-t border-gray-100 bg-gray-50/50">
            <button
              onClick={addRow}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-semibold text-violet-600 bg-white border border-violet-200 hover:bg-violet-50"
            >
              <Plus className="w-3.5 h-3.5" /> Baris
            </button>
          </div>
        </div>
      )}
    </div>
  );
}