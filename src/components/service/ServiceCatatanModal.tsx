"use client";
// src/components/service/ServiceCatatanModal.tsx

import { useEffect, useState } from "react";
import type { ServiceOrder } from "@/types/service";
import { useRegisterOverlay } from "@/contexts/OverlayContext";

interface Props {
  order: ServiceOrder | null;
  onClose: () => void;
  onSaved?: () => void;
}

export default function ServiceCatatanModal({ order, onClose, onSaved }: Props) {
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useRegisterOverlay(!!order);

  // Prefill tiap kali order yang dibuka berganti (isi ulang = menimpa)
  useEffect(() => {
    setCatatan(order?.catatan_pengerjaan ?? "");
    setError(null);
  }, [order]);

  if (!order) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/service/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_catatan", catatan_pengerjaan: catatan }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "Gagal menyimpan catatan");
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan catatan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#1a1a2e]">Catatan Pengerjaan</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {order.nama} · {order.type_laptop}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-2">
          <textarea
            value={catatan}
            onChange={e => setCatatan(e.target.value)}
            rows={5}
            autoFocus
            placeholder="Contoh: Sudah bongkar casing, kerusakan di IC charging. Nunggu konfirmasi ganti IC."
            className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-gray-300 focus:border-[#1a1a2e]/30 focus:ring-2 focus:ring-[#1a1a2e]/10"
          />
          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
          <p className="text-[11px] text-gray-400">
            Catatan akan menimpa isi sebelumnya dan langsung ter-update untuk tim.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-xl transition"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex h-9 items-center justify-center rounded-xl bg-gradient-to-r from-[#1a1a2e] to-[#2d2d4a] px-5 text-sm font-bold text-white shadow-sm transition-all hover:shadow-md disabled:opacity-60 active:scale-95"
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}