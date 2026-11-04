"use client";
// src/components/akutansi/BluePrint.tsx
//
// Tab "Blue Print" v3 — model MISI → RINCIAN → CENTANG.
// - 1 hari dipasangin 1 misi. Misi punya daftar rincian (to-do). Hari tanpa misi = libur.
// - Centang per rincian; tiap centang menyimpan & menampilkan nama pencentang.
// - Status PERSIST (tidak auto-reset). Reset hanya saat Admin/Accounting menekan tombol Reset.
// - Kelola Misi (buat misi, isi rincian, pasangin ke hari) & Reset: role manage saja.

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuthUser } from "@/hooks/useAuthUser";
import {
  Plus, X, Trash2, Check, CalendarDays, AlertTriangle, Loader2, RefreshCw, Settings, RotateCcw,
} from "lucide-react";

const DAY_LABELS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
const DAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const; // Senin dulu, Minggu terakhir

interface Mission {
  id: string;
  nama: string;
  day: number | null; // 0–6, null = belum dipasangin (tidak tampil di hari manapun)
  position: number;
}
interface Item {
  id: string;
  mission_id: string;
  keterangan: string;
  position: number;
}
interface CheckRow {
  item_id: string;
  checked_by_name?: string | null;
}

export default function BluePrint() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [checks, setChecks] = useState<Record<string, string>>({}); // item_id -> nama ("" kalau tak diketahui)
  const [myName, setMyName] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [showKelola, setShowKelola] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/akutansi/blueprint");
      const json = await res.json();
      if (!json.success) {
        setLoadError(json.message ?? "Gagal memuat Blue Print");
        return;
      }
      const { missions: ms, items: its, checks: cs } = json.data as {
        missions: Mission[];
        items: Item[];
        checks: CheckRow[];
      };
      setMissions(ms ?? []);
      setItems(its ?? []);
      const map: Record<string, string> = {};
      for (const c of cs ?? []) map[c.item_id] = c.checked_by_name ?? "";
      setChecks(map);
    } catch {
      setLoadError("Koneksi bermasalah");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelectedDay(new Date().getDay());
    getAuthUser()
      .then((u: any) => {
        setMyName(u?.name ?? "");
        const roles: string[] = u?.roles?.length ? u.roles : [u?.role].filter(Boolean);
        // NOTE: samakan dengan AKUNTANSI_MANAGE_ROLES kalau role manage-mu beda.
        setCanManage(roles.some((r) => ["ADMIN", "ACCOUNTING"].includes(r)));
      })
      .catch(() => {});
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const missionByDay = useMemo(() => {
    const m = new Map<number, Mission>();
    for (const mi of missions) if (mi.day !== null && mi.day !== undefined) m.set(mi.day, mi);
    return m;
  }, [missions]);

  const itemsOf = useCallback(
    (missionId: string) => items.filter((i) => i.mission_id === missionId),
    [items]
  );

  const dayProgress = useCallback(
    (day: number) => {
      const mission = missionByDay.get(day);
      if (!mission) return { mission: null as Mission | null, doneCount: 0, total: 0 };
      const its = itemsOf(mission.id);
      const doneCount = its.filter((i) => i.id in checks).length;
      return { mission, doneCount, total: its.length };
    },
    [missionByDay, itemsOf, checks]
  );

  // ── Centang rincian (optimistic) ──────────────────────────────────────────
  const toggleCheck = async (itemId: string) => {
    const wasChecked = itemId in checks;
    const prevName = checks[itemId];
    const nextVal = !wasChecked;
    setChecks((prev) => {
      const next = { ...prev };
      if (nextVal) next[itemId] = myName;
      else delete next[itemId];
      return next;
    });
    try {
      const res = await fetch("/api/akutansi/blueprint/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, done: nextVal, by: myName }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "gagal");
    } catch {
      setChecks((prev) => {
        const next = { ...prev };
        if (nextVal) delete next[itemId];
        else next[itemId] = prevName ?? "";
        return next;
      });
      setToast("Gagal menyimpan status — coba lagi");
    }
  };

  // ── Reset semua centang (manage) ──────────────────────────────────────────
  const resetAll = async () => {
    if (!confirm("Reset SEMUA centang Blue Print? Semua rincian akan kembali belum selesai.")) return;
    try {
      const res = await fetch("/api/akutansi/blueprint/reset", { method: "POST" });
      const json = await res.json();
      if (!json.success) {
        setToast(json.message ?? "Gagal reset");
        return;
      }
      setChecks({});
      setToast("Semua centang di-reset");
    } catch {
      setToast("Koneksi bermasalah");
    }
  };

  // ── Handler kelola misi (semua refetch setelah sukses) ─────────────────────
  const apiJson = async (url: string, opts: RequestInit) => {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
    const json = await res.json();
    if (!json.success) throw new Error(json.message ?? "Gagal");
    return json;
  };

  const createMission = async (nama: string, day: number | null) => {
    try {
      await apiJson("/api/akutansi/blueprint", { method: "POST", body: JSON.stringify({ nama, day }) });
      await load();
      setToast("Misi dibuat");
    } catch (e: any) {
      setToast(e?.message ?? "Gagal membuat misi");
    }
  };
  const updateMission = async (id: string, patch: { nama?: string; day?: number | null }) => {
    try {
      await apiJson(`/api/akutansi/blueprint/missions/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await load();
    } catch (e: any) {
      setToast(e?.message ?? "Gagal memperbarui misi");
    }
  };
  const deleteMission = async (id: string) => {
    if (!confirm("Hapus misi ini beserta semua rinciannya?")) return;
    try {
      await apiJson(`/api/akutansi/blueprint/missions/${id}`, { method: "DELETE" });
      await load();
      setToast("Misi dihapus");
    } catch (e: any) {
      setToast(e?.message ?? "Gagal menghapus misi");
    }
  };
  const createItem = async (mission_id: string, keterangan: string) => {
    try {
      await apiJson("/api/akutansi/blueprint/items", { method: "POST", body: JSON.stringify({ mission_id, keterangan }) });
      await load();
    } catch (e: any) {
      setToast(e?.message ?? "Gagal menambah rincian");
    }
  };
  const deleteItem = async (id: string) => {
    try {
      await apiJson(`/api/akutansi/blueprint/items/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setToast(e?.message ?? "Gagal menghapus rincian");
    }
  };

  const { mission: selMission, doneCount, total } = dayProgress(selectedDay);
  const selItems = selMission ? itemsOf(selMission.id) : [];
  const isLibur = !selMission;

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-gradient-to-br from-[#0f0c29] to-[#1a1545] text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg toast-in">
          {toast}
        </div>
      )}

      {/* Header ribbon */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="w-5 h-[2px] bg-gradient-to-r from-[#9C7420] to-transparent" />
            <span className="text-[9px] font-semibold tracking-[0.2em] uppercase text-[#9C7420]">
              Rutinitas Harian
            </span>
          </div>
          <h2 className="text-base font-bold text-gray-900">Blue Print</h2>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <>
              <button
                onClick={resetAll}
                title="Reset semua centang"
                className="h-10 px-3 flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 text-xs font-bold hover:bg-rose-100 active:scale-[0.96] transition-all duration-150 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </button>
              <button
                onClick={() => setShowKelola(true)}
                title="Kelola misi & rincian"
                className="h-10 px-4 flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#0f0c29] to-[#1a1545] text-white text-xs font-bold hover:opacity-90 active:scale-[0.96] transition-all duration-150 whitespace-nowrap"
              >
                <Settings className="w-3.5 h-3.5" /> Kelola Misi
              </button>
            </>
          )}
        </div>
      </div>

      {/* Info box */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 leading-relaxed">
        <AlertTriangle className="inline w-4 h-4 mr-1 -mt-0.5" /> Centang tiap <b>rincian</b> yang sudah dikerjakan — nama pencentang ikut tercatat. Status <b>tidak</b> reset otomatis; hanya Admin/Accounting yang bisa <b>Reset</b>. Hari tanpa misi = libur.
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
        </div>
      ) : loadError ? (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-4 text-xs text-red-700 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button onClick={load} className="inline-flex items-center gap-1.5 font-bold text-red-700 hover:underline shrink-0">
            <RefreshCw className="w-3.5 h-3.5" /> Coba lagi
          </button>
        </div>
      ) : (
        <>
          {/* Day selector */}
          <div className="flex flex-wrap gap-1.5">
            {DAY_ORDER.map((d) => {
              const active = selectedDay === d;
              const p = dayProgress(d);
              const complete = p.total > 0 && p.doneCount === p.total;
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all duration-150 flex flex-col items-center gap-0.5 min-w-[62px] ${
                    active
                      ? "bg-white border-slate-300 text-slate-900 shadow-xs"
                      : "bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-white"
                  }`}
                >
                  <span>{DAY_SHORT[d]}</span>
                  {!p.mission ? (
                    <span className="text-[9px] font-bold text-rose-400">Libur</span>
                  ) : (
                    <span className={`text-[9px] font-bold ${complete ? "text-emerald-600" : "text-slate-400"}`}>
                      {p.doneCount}/{p.total}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Konten hari terpilih */}
          {isLibur ? (
            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-3">
                <CalendarDays className="w-5 h-5 text-rose-300" />
              </div>
              <p className="text-sm font-semibold text-gray-500">{DAY_LABELS[selectedDay]} — Libur</p>
              <p className="text-xs text-gray-400 mt-1">Belum ada misi yang dipasang untuk hari ini.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 px-1">
                {DAY_LABELS[selectedDay]} · <span className="text-slate-700">{selMission!.nama}</span> · {doneCount}/{total} selesai
              </p>

              {selItems.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
                  <p className="text-sm text-gray-400">Misi ini belum punya rincian</p>
                </div>
              ) : (
                selItems.map((it) => {
                  const checked = it.id in checks;
                  const byName = checks[it.id];
                  return (
                    <div
                      key={it.id}
                      className={`bg-white rounded-xl border p-3.5 flex items-start gap-3 transition-colors ${
                        checked ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200"
                      }`}
                    >
                      <button
                        onClick={() => toggleCheck(it.id)}
                        title={checked ? "Batalkan selesai" : "Tandai selesai"}
                        className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 active:scale-90 transition-all duration-150 ${
                          checked
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : "border-slate-300 text-transparent hover:border-emerald-400"
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`text-[13px] font-medium break-words ${checked ? "text-emerald-700 line-through" : "text-gray-800"}`}>
                          {it.keterangan}
                        </p>
                        {checked && (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-emerald-600">
                            <Check className="w-3 h-3" />
                            {byName ? `oleh ${byName}` : "Selesai"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}

      {showKelola && (
        <KelolaMisiModal
          missions={missions}
          itemsOf={itemsOf}
          onClose={() => setShowKelola(false)}
          onCreateMission={createMission}
          onUpdateMission={updateMission}
          onDeleteMission={deleteMission}
          onCreateItem={createItem}
          onDeleteItem={deleteItem}
        />
      )}

      <style jsx global>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translate(-50%, 8px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .toast-in { animation: toastIn 0.25s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .toast-in { animation: none !important; } }
      `}</style>
    </div>
  );
}

// ── Modal Kelola Misi ────────────────────────────────────────────────────────
function KelolaMisiModal({
  missions,
  itemsOf,
  onClose,
  onCreateMission,
  onUpdateMission,
  onDeleteMission,
  onCreateItem,
  onDeleteItem,
}: {
  missions: Mission[];
  itemsOf: (missionId: string) => Item[];
  onClose: () => void;
  onCreateMission: (nama: string, day: number | null) => void;
  onUpdateMission: (id: string, patch: { nama?: string; day?: number | null }) => void;
  onDeleteMission: (id: string) => void;
  onCreateItem: (mission_id: string, keterangan: string) => void;
  onDeleteItem: (id: string) => void;
}) {
  const [newNama, setNewNama] = useState("");

  const addMission = () => {
    if (!newNama.trim()) return;
    onCreateMission(newNama.trim(), null);
    setNewNama("");
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-[#0f0c29] to-[#1a1545]" />
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-sm">Kelola Misi</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100 active:scale-90 transition-all duration-150 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tambah misi */}
        <div className="px-5 py-4 border-b border-gray-100 flex gap-2">
          <input
            value={newNama}
            onChange={(e) => setNewNama(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addMission()}
            placeholder="Nama misi baru, cth: Rutinitas Senin"
            className="flex-1 h-10 border border-gray-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
          />
          <button
            onClick={addMission}
            className="h-10 px-4 flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#0f0c29] to-[#1a1545] text-white text-xs font-bold hover:opacity-90 active:scale-[0.96] transition-all duration-150 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" /> Misi
          </button>
        </div>

        {/* Daftar misi */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {missions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Belum ada misi. Tambahkan di atas.</p>
          ) : (
            missions.map((m) => (
              <MissionEditor
                key={m.id}
                mission={m}
                items={itemsOf(m.id)}
                takenDays={missions.filter((x) => x.id !== m.id && x.day !== null).map((x) => x.day as number)}
                onUpdate={onUpdateMission}
                onDelete={onDeleteMission}
                onAddItem={onCreateItem}
                onDeleteItem={onDeleteItem}
              />
            ))
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="w-full h-10 bg-white border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 active:scale-[0.99] transition-all duration-150">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

function MissionEditor({
  mission,
  items,
  takenDays,
  onUpdate,
  onDelete,
  onAddItem,
  onDeleteItem,
}: {
  mission: Mission;
  items: Item[];
  takenDays: number[];
  onUpdate: (id: string, patch: { nama?: string; day?: number | null }) => void;
  onDelete: (id: string) => void;
  onAddItem: (mission_id: string, keterangan: string) => void;
  onDeleteItem: (id: string) => void;
}) {
  const [nama, setNama] = useState(mission.nama);
  const [newItem, setNewItem] = useState("");

  const saveNama = () => {
    const v = nama.trim();
    if (v && v !== mission.nama) onUpdate(mission.id, { nama: v });
  };
  const addItem = () => {
    if (!newItem.trim()) return;
    onAddItem(mission.id, newItem.trim());
    setNewItem("");
  };

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-3">
      {/* Nama + hari + hapus */}
      <div className="flex items-center gap-2">
        <input
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          onBlur={saveNama}
          className="flex-1 h-9 border border-gray-200 rounded-lg px-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
        />
        <select
          value={mission.day ?? ""}
          onChange={(e) => onUpdate(mission.id, { day: e.target.value === "" ? null : Number(e.target.value) })}
          title="Pasangin ke hari"
          className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="">— belum —</option>
          {ALL_DAYS.map((d) => (
            <option key={d} value={d}>
              {DAY_LABELS[d]}
              {takenDays.includes(d) ? " (dipakai)" : ""}
            </option>
          ))}
        </select>
        <button
          onClick={() => onDelete(mission.id)}
          title="Hapus misi"
          className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 active:scale-90 transition-all duration-150 shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Rincian */}
      <div className="space-y-1.5 pl-1">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 text-[13px] text-gray-700">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
            <span className="flex-1 break-words">{it.keterangan}</span>
            <button
              onClick={() => onDeleteItem(it.id)}
              title="Hapus rincian"
              className="p-1 rounded text-gray-300 hover:text-red-600 hover:bg-red-50 active:scale-90 transition-all duration-150 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            placeholder="Tambah rincian to-do…"
            className="flex-1 h-9 border border-gray-200 rounded-lg px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
          />
          <button
            onClick={addItem}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-slate-600 hover:bg-slate-50 active:scale-90 transition-all duration-150 shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}