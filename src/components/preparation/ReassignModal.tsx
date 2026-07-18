"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Check, Lightbulb } from "lucide-react";

interface DriverOption { id: string; name: string; role: string }
interface Props {
  orderId: string;
  currentDriverId: string | null;
  currentDriverName: string | null;
  onClose: () => void;
  onReassigned: () => void;
}

export default function ReassignModal({ orderId, currentDriverId, currentDriverName, onClose, onReassigned }: Props) {
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/preparation/delivery-users");
      const r = await res.json();
      if (r.success) setDrivers((r.data || []).filter((d: DriverOption) => d.id !== currentDriverId));
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [currentDriverId]);

  useEffect(() => { fetchDrivers(); }, [fetchDrivers]);

  const submit = async () => {
    setError("");
    if (!selectedId) { setError("Pilih pengantar baru dulu"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/preparation/${orderId}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delivery_user_id: selectedId, delivery_user_name: selectedName }),
      });
      const result = await res.json();
      if (!result.success) { setError(result.message || "Gagal"); return; }
      onReassigned();
      onClose();
    } catch { setError("Terjadi kesalahan koneksi"); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        <div className="bg-indigo-600 px-5 py-4">
          <p className="font-bold text-white text-sm"><RefreshCw className="inline w-4 h-4 mr-1" /> Pindah Pengantar</p>
          <p className="text-xs text-indigo-100 mt-0.5">
            Saat ini: <span className="font-bold">{currentDriverName || "—"}</span>
          </p>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2.5">
          {loading ? (
            <div className="text-xs text-gray-400 py-4 text-center">Memuat daftar pengantar...</div>
          ) : drivers.length === 0 ? (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Tidak ada pengantar lain yang tersedia.
            </div>
          ) : (
            <div className="space-y-1.5">
              {drivers.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => { setSelectedId(d.id); setSelectedName(d.name); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition ${
                    selectedId === d.id ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    selectedId === d.id ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-500"
                  }`}>
                    {d.name?.charAt(0)?.toUpperCase() ?? "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-bold truncate ${selectedId === d.id ? "text-indigo-800" : "text-gray-700"}`}>{d.name}</p>
                    <p className="text-[10px] text-gray-400">{d.role}</p>
                  </div>
                  {selectedId === d.id && <span className="text-indigo-600 flex-shrink-0"><Check className="w-4 h-4" /></span>}
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-400">
<Lightbulb className="inline w-4 h-4 mr-1" /> Kalau pengantar belum mulai jalan, tugas akan diset ulang ke "Menunggu Persetujuan" —
            pengantar baru harus klik setuju dulu. Kalau sudah di jalan, tugas langsung dipindah tanpa reset tracking.
          </p>
          {error && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
          <button onClick={submit} disabled={saving || !selectedId} className="flex-1 h-11 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-50">
            {saving ? "Memindahkan..." : "Pindahkan"}
          </button>
        </div>
      </div>
    </div>
  );
}