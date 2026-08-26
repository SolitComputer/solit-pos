"use client";

import { useState } from "react";
import { OVERTIME_CATEGORIES, OVERTIME_CATEGORY_LABELS, type OvertimeCategory, formatOvertimeMinutes } from "@/lib/overtimeEngine";

export function OvertimeFillDetailModal({
  overtimeId, minutes, direction, onClose, onSaved,
}: {
  overtimeId: string;
  minutes: number;
  direction: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<OvertimeCategory | "">("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const directionLabel =
    direction === "BEFORE_IN" ? "sebelum jam masuk" :
    direction === "AFTER_OUT" ? "sesudah jam pulang" :
    direction === "HOLIDAY" ? "lembur hari libur" : "lembur";

  const save = async () => {
    if (!category) { setError("Pilih kategori lembur — wajib salah satu dari 3 pilihan SOP."); return; }
    if (!description.trim()) { setError("Keterangan wajib diisi."); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overtimeId, action: "SUBMIT_DETAIL", category, work_description: description.trim() }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal menyimpan"); return; }
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan — periksa koneksi internet.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-5 bg-gradient-to-r from-violet-600 to-purple-700">
          <p className="text-white font-bold text-sm">Lemburmu Terdeteksi</p>
          <p className="text-white/70 text-xs mt-1">
            {formatOvertimeMinutes(minutes)} — {directionLabel}. Isi keterangan supaya kepala divisimu bisa meng-ACC.
          </p>
        </div>
        <div className="px-5 py-4 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-3 rounded-xl">{error}</div>}
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Kategori Lembur (wajib) *</label>
            <div className="grid grid-cols-1 gap-2">
              {OVERTIME_CATEGORIES.map((cat) => (
                <button key={cat} type="button" onClick={() => setCategory(cat)}
                  className={`text-left px-3.5 py-3 rounded-xl border text-xs font-semibold transition-all ${category === cat ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-gray-200 text-gray-700 hover:border-violet-300"}`}>
                  {OVERTIME_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Keterangan Pekerjaan *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="Jelaskan pekerjaan yang dilakukan selama lembur..."
              className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-none" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2.5">
          <button onClick={onClose} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold">Nanti Saja</button>
          <button onClick={save} disabled={saving} className="flex-1 h-10 bg-violet-600 text-white rounded-xl text-xs font-bold disabled:opacity-50">
            {saving ? "Menyimpan..." : "Kirim ke Kepala Divisi"}
          </button>
        </div>
      </div>
    </div>
  );
}