"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Sun, Moon, X, Check, Calendar } from "lucide-react";
import { SHIFT_DEFAULTS } from "@/lib/shiftSchedule";

// ─── Types ────────────────────────────────────────────────────────────────────
export type WeeklyScheduleRow = {
  id?: string;
  user_id: string;
  day_of_week: number; // 0=Min, 1=Sen, ..., 6=Sab
  shift: "PAGI" | "SORE";
  open_hour: number;
  open_minute: number;
  late_hour: number;
  late_minute: number;
  close_hour: number;
  close_minute: number;
  checkout_hour: number;
  checkout_minute: number;
};

type UserInfo = {
  id: string;
  name: string;
  role: string;
  shift?: "PAGI" | "SORE" | null;
};

const DAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const DAY_FULL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function pad2(n: number) { return n.toString().padStart(2, "0"); }
function minToHHMM(h: number, m: number) { return `${pad2(h)}:${pad2(m)}`; }

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}

// ─── Komponen utama ───────────────────────────────────────────────────────────
export function WeeklyScheduleModal({
  user,
  existingSchedules,
  onClose,
  onSaved,
}: {
  user: UserInfo;
  existingSchedules: WeeklyScheduleRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // State per hari (0-6): null = belum di-set (fallback ke default)
  type DayConfig = {
    shift: "PAGI" | "SORE";
    open_hour: number;
    open_minute: number;
    late_hour: number;
    late_minute: number;
    close_hour: number;
    close_minute: number;
    checkout_hour: number;
    checkout_minute: number;
  };

  const buildInitial = useCallback((): Record<number, DayConfig | null> => {
    const m: Record<number, DayConfig | null> = {};
    for (let d = 0; d < 7; d++) m[d] = null;
    existingSchedules
      .filter(s => s.user_id === user.id)
      .forEach(s => {
        m[s.day_of_week] = {
          shift: s.shift,
          open_hour: s.open_hour,
          open_minute: s.open_minute,
          late_hour: s.late_hour,
          late_minute: s.late_minute,
          close_hour: s.close_hour,
          close_minute: s.close_minute,
          checkout_hour: s.checkout_hour,
          checkout_minute: s.checkout_minute,
        };
      });
    return m;
  }, [existingSchedules, user.id]);

  const [dayConfigs, setDayConfigs] = useState<Record<number, DayConfig | null>>(buildInitial);
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [editShift, setEditShift] = useState<"PAGI" | "SORE">("PAGI");
  const [editOpen, setEditOpen] = useState({ h: 7, m: 30 });
  const [editLate, setEditLate] = useState({ h: 8, m: 0 });
  const [editClose, setEditClose] = useState({ h: 12, m: 0 });
  const [editCheckout, setEditCheckout] = useState({ h: 17, m: 0 });
  const [saving, setSaving] = useState(false);
  const [justApplied, setJustApplied] = useState(false);

  const userBaseShift = (user.shift ?? "PAGI") as "PAGI" | "SORE";
  const baseDefaults = SHIFT_DEFAULTS[userBaseShift] ?? SHIFT_DEFAULTS.PAGI;

  // Toggle pilih hari
  const toggleDay = (d: number) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
    setJustApplied(false);
  };

  // Set shift di panel editor → auto-fill jam default shift itu
  const handleShiftChange = (s: "PAGI" | "SORE") => {
    setEditShift(s);
    const def = SHIFT_DEFAULTS[s];
    setEditOpen({ h: def.open_hour, m: def.open_minute });
    setEditLate({ h: def.late_hour, m: def.late_minute });
    setEditClose({ h: def.close_hour, m: def.close_minute });
    setEditCheckout({ h: def.checkout_hour, m: def.checkout_minute });
  };

  // Terapkan ke hari terpilih
  const applyToSelected = () => {
    if (selectedDays.size === 0) return;
    setDayConfigs(prev => {
      const next = { ...prev };
      selectedDays.forEach(d => {
        next[d] = {
          shift: editShift,
          open_hour: editOpen.h,
          open_minute: editOpen.m,
          late_hour: editLate.h,
          late_minute: editLate.m,
          close_hour: editClose.h,
          close_minute: editClose.m,
          checkout_hour: editCheckout.h,
          checkout_minute: editCheckout.m,
        };
      });
      return next;
    });
    setSelectedDays(new Set());
    setJustApplied(true);
  };

  // Hapus jadwal mingguan dari hari tertentu (kembali ke default)
  const clearDay = (d: number) => {
    setDayConfigs(prev => ({ ...prev, [d]: null }));
  };

  // Hitung berapa hari yang sudah di-set
  const configuredCount = useMemo(() => {
    return Object.values(dayConfigs).filter(Boolean).length;
  }, [dayConfigs]);

  // Simpan ke API
  const handleSave = async () => {
    setSaving(true);
    try {
      const schedules = Object.entries(dayConfigs)
        .filter(([, cfg]) => cfg !== null)
        .map(([day, cfg]) => ({
          day_of_week: parseInt(day),
          shift: cfg!.shift,
          open_hour: cfg!.open_hour,
          open_minute: cfg!.open_minute,
          late_hour: cfg!.late_hour,
          late_minute: cfg!.late_minute,
          close_hour: cfg!.close_hour,
          close_minute: cfg!.close_minute,
          checkout_hour: cfg!.checkout_hour,
          checkout_minute: cfg!.checkout_minute,
        }));

      const res = await fetch("/api/attendance/weekly-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, schedules }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(`Gagal menyimpan: ${data.message}`);
        return;
      }
      onSaved();
      onClose();
    } catch (err) {
      console.error("Failed to save weekly schedule:", err);
      alert("Gagal menyimpan jadwal mingguan");
    } finally {
      setSaving(false);
    }
  };

  // ─── Time input helper ────────────────────────────────────────────────────
  const TimeInput = ({ label, color, value, onChange }: {
    label: string;
    color: "green" | "amber" | "red" | "blue";
    value: { h: number; m: number };
    onChange: (v: { h: number; m: number }) => void;
  }) => {
    const colors = {
      green: { bg: "bg-emerald-50", label: "text-emerald-700", border: "border-emerald-200" },
      amber: { bg: "bg-amber-50", label: "text-amber-700", border: "border-amber-200" },
      red: { bg: "bg-red-50", label: "text-red-700", border: "border-red-200" },
      blue: { bg: "bg-sky-50", label: "text-sky-700", border: "border-sky-200" },
    };
    const c = colors[color];
    return (
      <div className={`${c.bg} rounded-xl p-3 text-center border ${c.border}`}>
        <div className={`text-[9px] font-black uppercase tracking-wider ${c.label} mb-2`}>{label}</div>
        <div className="flex items-center justify-center gap-1">
          <input
            type="number" min={0} max={23}
            value={value.h}
            onChange={e => onChange({ h: Math.max(0, Math.min(23, parseInt(e.target.value) || 0)), m: value.m })}
            className="w-10 h-8 text-center text-sm font-mono font-bold bg-white/80 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400/30"
          />
          <span className="text-gray-400 font-bold">:</span>
          <input
            type="number" min={0} max={59}
            value={value.m}
            onChange={e => onChange({ h: value.h, m: Math.max(0, Math.min(59, parseInt(e.target.value) || 0)) })}
            className="w-10 h-8 text-center text-sm font-mono font-bold bg-white/80 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400/30"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 backdrop-blur-sm pt-[5vh] overflow-y-auto pb-10" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 w-full max-w-[580px] rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">Jadwal Mingguan</h3>
              <p className="text-xs text-white/80 mt-0.5">Atur jadwal shift per hari dalam seminggu</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* User info */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
              {initials(user.name)}
            </div>
            <div>
              <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">{user.name}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">{user.role?.replace(/_/g, " ")} · Default: {userBaseShift}</p>
            </div>
          </div>

          {/* Instruksi */}
          <div className="text-[11px] text-gray-500 dark:text-gray-400 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 rounded-xl px-4 py-3 leading-relaxed">
            <Calendar className="w-3.5 h-3.5 inline mr-1.5 text-violet-500" />
            Tap hari yang mau diubah, set shift dan jam di bawah, lalu klik <strong>Terapkan</strong>. Hari tanpa jadwal mingguan akan pakai pengaturan default user.
          </div>

          {/* Grid 7 hari */}
          <div className="grid grid-cols-7 gap-2">
            {DAY_LABELS.map((label, d) => {
              const cfg = dayConfigs[d];
              const isSelected = selectedDays.has(d);
              const shiftLabel = cfg?.shift ?? userBaseShift;
              const lateStr = cfg
                ? minToHHMM(cfg.late_hour, cfg.late_minute)
                : minToHHMM(baseDefaults.late_hour, baseDefaults.late_minute);

              return (
                <button
                  key={d}
                  onClick={() => toggleDay(d)}
                  className={`text-center p-2.5 rounded-xl border-2 transition-all cursor-pointer ${
                    isSelected
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-900/30 ring-2 ring-violet-200"
                      : cfg
                        ? "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-violet-300"
                        : "border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 hover:border-violet-300"
                  }`}
                >
                  <div className="text-[10px] font-bold text-gray-400 mb-1.5">{label}</div>
                  <div className={`text-[10px] font-bold px-1 py-0.5 rounded-md mb-1 ${
                    cfg
                      ? cfg.shift === "PAGI"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-indigo-100 text-indigo-700"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-400"
                  }`}>
                    {cfg ? (cfg.shift === "PAGI" ? "Pagi" : "Sore") : "—"}
                  </div>
                  <div className="text-[10px] font-mono text-gray-500">
                    {cfg ? lateStr : "—"}
                  </div>
                  {cfg && (
                    <button
                      onClick={e => { e.stopPropagation(); clearDay(d); }}
                      className="mt-1 text-[8px] text-red-400 hover:text-red-600 transition-colors"
                      title={`Hapus jadwal ${DAY_FULL[d]}`}
                    >
                      hapus
                    </button>
                  )}
                </button>
              );
            })}
          </div>

          {/* Panel editor */}
          <div className={`border-2 rounded-xl p-4 transition-all ${
            selectedDays.size > 0
              ? "border-violet-400 bg-violet-50/50 dark:bg-violet-900/10"
              : "border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50"
          }`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold text-violet-700 dark:text-violet-400">
                {selectedDays.size > 0
                  ? `Atur jadwal untuk: ${[...selectedDays].sort().map(d => DAY_LABELS[d]).join(", ")}`
                  : "Tap hari di atas untuk mulai mengatur"
                }
              </span>
            </div>

            {selectedDays.size > 0 && (
              <>
                {/* Shift toggle */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-bold text-gray-500">Shift</span>
                  <button
                    onClick={() => handleShiftChange("PAGI")}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
                      editShift === "PAGI"
                        ? "bg-amber-100 text-amber-700 border-amber-300"
                        : "bg-white dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-600 hover:border-amber-300"
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" /> Pagi
                  </button>
                  <button
                    onClick={() => handleShiftChange("SORE")}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
                      editShift === "SORE"
                        ? "bg-indigo-100 text-indigo-700 border-indigo-300"
                        : "bg-white dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-600 hover:border-indigo-300"
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" /> Sore
                  </button>
                </div>

                {/* Time inputs */}
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <TimeInput label="Buka absen" color="green" value={editOpen} onChange={setEditOpen} />
                  <TimeInput label="Batas tepat" color="amber" value={editLate} onChange={setEditLate} />
                  <TimeInput label="Tutup absen" color="red" value={editClose} onChange={setEditClose} />
                  <TimeInput label="Jam pulang" color="blue" value={editCheckout} onChange={setEditCheckout} />
                </div>

                {/* Apply button */}
                <button
                  onClick={applyToSelected}
                  className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <Check className="w-3.5 h-3.5" />
                  Terapkan ke {selectedDays.size} hari terpilih
                </button>
              </>
            )}

            {justApplied && selectedDays.size === 0 && (
              <div className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 mt-1">
                <Check className="w-3.5 h-3.5" /> Berhasil diterapkan! Pilih hari lain atau simpan.
              </div>
            )}
          </div>

          {/* Prioritas */}
          <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-2.5">
            <span className="text-gray-400 mr-1">Prioritas:</span>
            <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md font-bold border border-blue-100">Jadwal tanggal</span>
            <span>›</span>
            <span className="bg-violet-50 text-violet-600 px-2 py-0.5 rounded-md font-bold border border-violet-100">Jadwal mingguan</span>
            <span>›</span>
            <span className="text-gray-500 font-bold">Default user</span>
            <span>›</span>
            <span className="text-gray-400">Default shift</span>
          </div>

          {/* Footer buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : `Simpan jadwal (${configuredCount} hari)`}
            </button>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}