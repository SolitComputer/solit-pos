"use client";
// src/components/akutansi/BluePrint.tsx
//
// Tab "Blue Print" — checklist rutinitas kerja akuntansi harian (Senin–Sabtu, Minggu libur).
// Versi SHARED: status & misi tambahan disimpan di Supabase lewat /api/akutansi/blueprint,
// jadi centang "Selesai" kebagi ke seluruh tim. Status auto-reset tiap minggu (week_key
// dihitung di server, zona WIB). Misi rutin bawaan tetap di kode (DEFAULT_MISSIONS).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X, Trash2, Check, CalendarDays, AlertTriangle, Loader2, RefreshCw } from "lucide-react";

// 0 = Minggu (libur), 1 = Senin ... 6 = Sabtu — sama persis dengan Date.getDay()
const DAY_LABELS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
const DAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;
const WORK_DAYS = [1, 2, 3, 4, 5, 6] as const;
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const; // tampil Senin dulu, Minggu terakhir

interface Mission {
  id: string;
  keterangan: string;
  days: number[]; // hari misi muncul (1–6)
  isDefault: boolean; // true = rutin bawaan (tidak bisa dihapus)
}

// Misi rutin bawaan — acuan tetap sesuai blueprint Rayhan (tetap di kode, bukan DB).
// "Sinkronin cash dengan fisik" muncul tiap hari kerja; "mutasi bank" di Senin & Kamis.
const DEFAULT_MISSIONS: Mission[] = [
  { id: "def-cash", keterangan: "Sinkronin cash dengan fisik", days: [1, 2, 3, 4, 5, 6], isDefault: true },
  { id: "def-bank", keterangan: "Sinkronin akun saldo dengan mutasi di bank", days: [1, 4], isDefault: true },
  { id: "def-sn-laptop", keterangan: "Update data SN laptop di Excel, sinkronin dengan akun HPP/Modal", days: [2], isDefault: true },
  { id: "def-audit-laptop", keterangan: "Audit fisik laptop", days: [2], isDefault: true },
  { id: "def-piutang", keterangan: "Update data piutang sesuai akun piutang", days: [3], isDefault: true },
  { id: "def-lapor-piutang", keterangan: "Lapor ke finance rincian piutang", days: [3], isDefault: true },
  { id: "def-kasbon", keterangan: "Update data kasbon & cicilan, sesuaikan dengan akunnya", days: [4], isDefault: true },
  { id: "def-aset", keterangan: "Update data aset tetap sesuai akunnya", days: [5], isDefault: true },
  { id: "def-audit-aset", keterangan: "Audit fisik aset tetap", days: [5], isDefault: true },
  { id: "def-aksesoris", keterangan: "Update data aksesoris & aksesoris service sesuai akunnya", days: [6], isDefault: true },
  { id: "def-audit-aksesoris", keterangan: "Audit fisik aksesoris", days: [6], isDefault: true },
];

// Kunci penyelesaian unik per misi per hari (satu misi bisa muncul di banyak hari).
const doneKey = (missionId: string, day: number) => `${missionId}__${day}`;

interface TaskRow {
  id: string;
  keterangan: string;
  days: number[];
}
interface CompletionRow {
  task_key: string;
  day: number;
}

export default function BluePrint() {
  const [custom, setCustom] = useState<Mission[]>([]);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [weekKey, setWeekKey] = useState("");
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [showForm, setShowForm] = useState(false);
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
      const { weekKey: wk, tasks, completions } = json.data as {
        weekKey: string;
        tasks: TaskRow[];
        completions: CompletionRow[];
      };
      setWeekKey(wk);
      setCustom(
        (tasks ?? []).map((t) => ({
          id: t.id,
          keterangan: t.keterangan,
          days: Array.isArray(t.days) ? t.days : [],
          isDefault: false,
        }))
      );
      const map: Record<string, boolean> = {};
      for (const c of completions ?? []) map[doneKey(c.task_key, c.day)] = true;
      setDone(map);
    } catch {
      setLoadError("Koneksi bermasalah");
    } finally {
      setLoading(false);
    }
  }, []);

  // Hari ini sebagai default tab (client-only → set di effect, hindari hydration mismatch).
  useEffect(() => {
    setSelectedDay(new Date().getDay());
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const allMissions = useMemo(() => [...DEFAULT_MISSIONS, ...custom], [custom]);

  const missionsForDay = useCallback(
    (day: number) => allMissions.filter((m) => m.days.includes(day)),
    [allMissions]
  );

  const dayProgress = useCallback(
    (day: number) => {
      const items = missionsForDay(day);
      const total = items.length;
      const doneCount = items.filter((m) => done[doneKey(m.id, day)]).length;
      return { doneCount, total };
    },
    [missionsForDay, done]
  );

  // Tandai / batal selesai — optimistic; revert kalau server gagal.
  const toggleDone = async (missionId: string, day: number) => {
    const k = doneKey(missionId, day);
    const nextVal = !done[k];
    setDone((prev) => {
      const next = { ...prev };
      if (nextVal) next[k] = true;
      else delete next[k];
      return next;
    });
    try {
      const res = await fetch("/api/akutansi/blueprint/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_key: missionId, day, done: nextVal }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "gagal");
    } catch {
      // revert ke kondisi sebelumnya
      setDone((prev) => {
        const next = { ...prev };
        if (nextVal) delete next[k];
        else next[k] = true;
        return next;
      });
      setToast("Gagal menyimpan status — coba lagi");
    }
  };

  const addMission = async (keterangan: string, days: number[]) => {
    try {
      const res = await fetch("/api/akutansi/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keterangan, days }),
      });
      const json = await res.json();
      if (!json.success) {
        setToast(json.message ?? "Gagal menambah misi");
        return;
      }
      const t = json.data as TaskRow;
      setCustom((prev) => [
        ...prev,
        { id: t.id, keterangan: t.keterangan, days: Array.isArray(t.days) ? t.days : [], isDefault: false },
      ]);
      setToast("Misi ditambahkan");
    } catch {
      setToast("Koneksi bermasalah");
    }
  };

  const deleteMission = async (m: Mission) => {
    if (m.isDefault) return;
    if (!confirm(`Hapus misi "${m.keterangan}"?`)) return;
    try {
      const res = await fetch(`/api/akutansi/blueprint/${m.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) {
        setToast(json.message ?? "Gagal menghapus");
        return;
      }
      setCustom((prev) => prev.filter((x) => x.id !== m.id));
      setDone((prev) => {
        const next: Record<string, boolean> = {};
        for (const [key, val] of Object.entries(prev)) {
          if (!key.startsWith(`${m.id}__`)) next[key] = val;
        }
        return next;
      });
      setToast("Misi dihapus");
    } catch {
      setToast("Koneksi bermasalah");
    }
  };

  const list = missionsForDay(selectedDay);
  const prog = dayProgress(selectedDay);
  const isSunday = selectedDay === 0;

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
          {weekKey && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200 inline-flex items-center gap-1">
              <CalendarDays className="w-3 h-3" /> Minggu {weekKey}
            </span>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="h-10 px-4 flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#0f0c29] to-[#1a1545] text-white text-xs font-bold hover:opacity-90 active:scale-[0.96] transition-all duration-150 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" /> Tambah List
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 leading-relaxed">
        <AlertTriangle className="inline w-4 h-4 mr-1 -mt-0.5" /> Centang <b>Selesai</b> tiap misi yang sudah dikerjakan. Status kebagi ke seluruh tim & otomatis <b>reset tiap awal minggu</b> (Senin). Minggu = libur.
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
        </div>
      ) : loadError ? (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-4 text-xs text-red-700 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 font-bold text-red-700 hover:underline shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Coba lagi
          </button>
        </div>
      ) : (
        <>
          {/* Day selector — pilih hari, ada progress x/y per hari */}
          <div className="flex flex-wrap gap-1.5">
            {DAY_ORDER.map((d) => {
              const active = selectedDay === d;
              const sunday = d === 0;
              const { doneCount, total } = dayProgress(d);
              const complete = total > 0 && doneCount === total;
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
                  {sunday ? (
                    <span className="text-[9px] font-bold text-rose-400">Libur</span>
                  ) : (
                    <span className={`text-[9px] font-bold ${complete ? "text-emerald-600" : "text-slate-400"}`}>
                      {doneCount}/{total}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Daftar misi hari terpilih */}
          {isSunday ? (
            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-3">
                <CalendarDays className="w-5 h-5 text-rose-300" />
              </div>
              <p className="text-sm font-semibold text-gray-500">Minggu — Libur</p>
              <p className="text-xs text-gray-400 mt-1">Tidak ada misi hari ini.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 px-1">
                {DAY_LABELS[selectedDay]} · {prog.doneCount}/{prog.total} selesai
              </p>

              {list.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
                  <p className="text-sm text-gray-400">Belum ada misi untuk hari ini</p>
                </div>
              ) : (
                list.map((m) => {
                  const checked = !!done[doneKey(m.id, selectedDay)];
                  return (
                    <div
                      key={m.id}
                      className={`bg-white rounded-xl border p-3.5 flex items-start gap-3 transition-colors ${
                        checked ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200"
                      }`}
                    >
                      <button
                        onClick={() => toggleDone(m.id, selectedDay)}
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
                        <p
                          className={`text-[13px] font-medium break-words ${
                            checked ? "text-emerald-700 line-through" : "text-gray-800"
                          }`}
                        >
                          {m.keterangan}
                        </p>
                        <span
                          className={`inline-block mt-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                            m.isDefault
                              ? "bg-gray-100 text-gray-500 border-gray-200"
                              : "bg-violet-50 text-violet-700 border-violet-200"
                          }`}
                        >
                          {m.isDefault ? "Rutin" : "Tambahan"}
                        </span>
                      </div>

                      {!m.isDefault && (
                        <button
                          onClick={() => deleteMission(m)}
                          title="Hapus misi"
                          className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 active:scale-90 transition-all duration-150 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}

      {showForm && (
        <AddMissionModal
          onClose={() => setShowForm(false)}
          onSave={(ket, days) => {
            addMission(ket, days);
            setShowForm(false);
          }}
        />
      )}

      <style jsx global>{`
        @keyframes toastIn {
          from {
            opacity: 0;
            transform: translate(-50%, 8px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        .toast-in {
          animation: toastIn 0.25s ease-out both;
        }
        @media (prefers-reduced-motion: reduce) {
          .toast-in {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function AddMissionModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (keterangan: string, days: number[]) => void;
}) {
  const [keterangan, setKeterangan] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [error, setError] = useState("");

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const submit = () => {
    setError("");
    if (!keterangan.trim()) return setError("Keterangan misi wajib diisi");
    if (days.length === 0) return setError("Pilih minimal 1 hari");
    onSave(keterangan, days);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-[#0f0c29] to-[#1a1545]" />
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-sm">Tambah Misi Baru</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100 active:scale-90 transition-all duration-150 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Keterangan Misi</label>
            <input
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="cth: Rekap faktur pajak masukan"
              className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Hari (boleh lebih dari satu)</label>
            <div className="flex flex-wrap gap-1.5">
              {WORK_DAYS.map((d) => {
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all duration-150 active:scale-95 ${
                      on
                        ? "bg-gradient-to-br from-[#0f0c29] to-[#1a1545] text-white border-transparent"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {DAY_SHORT[d]}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 h-10 bg-white border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 active:scale-[0.97] transition-all duration-150"
          >
            Batal
          </button>
          <button
            onClick={submit}
            className="flex-1 h-10 bg-gradient-to-br from-[#0f0c29] to-[#1a1545] text-white rounded-xl text-sm font-bold hover:opacity-90 active:scale-[0.97] transition-all duration-150"
          >
            Simpan Misi
          </button>
        </div>
      </div>
    </div>
  );
}