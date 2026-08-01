"use client";

import { useState } from "react";
import { OVERTIME_CATEGORIES, OVERTIME_CATEGORY_LABELS, type OvertimeCategory } from "@/lib/overtimeEngine";

type UserOption = { id: string; name: string; role: string };

// Poin 8: absen pulang manual — HANYA admin, untuk perbaikan kalau sistem
// gagal mencatat absen keluar otomatis.
export function ManualCheckoutModal({ users, onClose, onSaved }: {
  users: UserOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
  const [category, setCategory] = useState<OvertimeCategory | "">("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!userId || !date || !time) { setError("Karyawan, tanggal, dan jam wajib diisi."); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/attendance/manual-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId, checkout_date: date, checkout_time: time,
          category: category || null, work_description: desc.trim() || null,
        }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal menyimpan absen pulang manual."); return; }
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.message || "Terjadi kesalahan jaringan — coba lagi.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3.5">
        <div>
          <p className="font-bold text-sm text-gray-800">Absen Pulang Manual (Admin)</p>
          <p className="text-[11px] text-gray-400 mt-1">Untuk perbaikan kalau sistem gagal mencatat absen keluar otomatis.</p>
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-3 rounded-xl">{error}</div>}
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Karyawan *</label>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="w-full h-10 border border-gray-200 rounded-xl px-3 text-xs bg-white">
            {users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.role.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Tanggal *</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full h-10 border border-gray-200 rounded-xl px-3 text-xs" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Jam Pulang *</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full h-10 border border-gray-200 rounded-xl px-3 text-xs" />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
            Kategori Lembur <span className="font-normal normal-case text-gray-300">(isi kalau jam pulang ini menghasilkan lembur)</span>
          </label>
          <select value={category} onChange={(e) => setCategory(e.target.value as OvertimeCategory)} className="w-full h-10 border border-gray-200 rounded-xl px-3 text-xs bg-white">
            <option value="">— Tidak diisi —</option>
            {OVERTIME_CATEGORIES.map((c) => <option key={c} value={c}>{OVERTIME_CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Keterangan (opsional)..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs resize-none" />
        <div className="flex gap-2.5">
          <button onClick={onClose} className="flex-1 h-10 bg-gray-100 rounded-xl text-xs font-semibold text-gray-600">Batal</button>
          <button onClick={save} disabled={saving} className="flex-1 h-10 bg-[#1a1a2e] rounded-xl text-xs font-bold text-white disabled:opacity-50">
            {saving ? "Menyimpan..." : "Simpan Absen Pulang"}
          </button>
        </div>
      </div>
    </div>
  );
}