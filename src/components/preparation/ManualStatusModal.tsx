"use client";

import { useState } from "react";
import { Bike, CheckCircle2, Undo2, Home, Wrench, Clock } from "lucide-react";

interface Props {
  orderId: string;
  currentStatus: string;
  hasReturnStarted: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const OPTIONS: { target: string; label: string; desc: string; icon: React.ReactNode; showWhen: (s: string, r: boolean) => boolean }[] = [
  { target: "MENUNGGU_PENGANTAR", label: "Menunggu Pengantar", desc: "Reset ke belum disetujui pengantar", icon: <Clock className="w-4 h-4" />, showWhen: () => true },
  { target: "DIKIRIM", label: "Sedang Diantar", desc: "Set langsung ke fase sedang jalan", icon: <Bike className="w-4 h-4" />, showWhen: () => true },
  { target: "SELESAI", label: "Selesai (Terkirim)", desc: "Tandai barang sudah sampai ke customer", icon: <CheckCircle2 className="w-4 h-4" />, showWhen: () => true },
  { target: "RETURN_IN_PROGRESS", label: "Mulai Perjalanan Pulang", desc: "Hanya bisa jika status sudah Selesai", icon: <Undo2 className="w-4 h-4" />, showWhen: (s) => s === "SELESAI" },
  { target: "RETURN_DONE", label: "Sudah Sampai Toko", desc: "Tandai pengantar sudah kembali", icon: <Home className="w-4 h-4" />, showWhen: (s, r) => s === "SELESAI" && r },
];

export default function ManualStatusModal({ orderId, currentStatus, hasReturnStarted, onClose, onChanged }: Props) {
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!target) { setError("Pilih status tujuan dulu"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/preparation/${orderId}/manual-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, reason: reason.trim() || null }),
      });
      const result = await res.json();
      if (!result.success) { setError(result.message || "Gagal"); return; }
      onChanged();
      onClose();
    } catch { setError("Terjadi kesalahan koneksi"); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        <div className="bg-[#1a1a2e] px-5 py-4">
          <p className="font-bold text-white text-sm"><Wrench className="inline w-4 h-4 mr-1" /> Override Status Manual</p>
          <p className="text-xs text-gray-300 mt-0.5">Status saat ini: {currentStatus}</p>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2.5">
          {OPTIONS.filter(o => o.showWhen(currentStatus, hasReturnStarted)).map(o => (
            <button
              key={o.target}
              type="button"
              onClick={() => setTarget(o.target)}
              className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition ${
                target === o.target ? "border-[#1a1a2e] bg-gray-50" : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <span className="text-2xl">{o.icon}</span>
              <div>
                <p className="text-sm font-bold text-gray-700">{o.label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{o.desc}</p>
              </div>
            </button>
          ))}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Alasan (opsional, untuk log)</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="Contoh: pengantar lupa update status, koreksi manual, dll."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition resize-none"
            />
          </div>
          {error && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
          <button onClick={submit} disabled={saving || !target} className="flex-1 h-11 bg-[#1a1a2e] text-white rounded-xl text-sm font-semibold hover:bg-[#16213e] transition disabled:opacity-50">
            {saving ? "Menyimpan..." : "Terapkan"}
          </button>
        </div>
      </div>
    </div>
  );
}