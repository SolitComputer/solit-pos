// src/components/inventory/MinusReasonModal.tsx
"use client";

import { useEffect, useState } from "react";
import { Ban, X, AlertTriangle } from "lucide-react";

interface Props {
  unit: { id: string; name: string; sn: string | null };
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

const MIN_CHARS = 5;

/**
 * Modal untuk Team QC menandai unit sebagai MINUS dengan keterangan wajib.
 *
 * Alur:
 *   1. Team QC klik "Tandai MINUS" di QcEditModal → modal ini muncul
 *   2. User WAJIB isi alasan (min 5 char) — alasan jadi analisa awal
 *   3. Alasan disimpan ke:
 *      - unit.analisa (untuk ditampilkan ke Pengelola Barang)
 *      - qc_history.reason (audit trail)
 *   4. Pengelola Barang buka tab "Dari Team QC" → lihat analisa → putuskan
 *      (Perbaiki / MSJ / Aset Matot) via QcDecisionModal
 *
 * Kenapa modal terpisah, bukan window.prompt?
 *   - Prompt native tidak bisa di-style, tidak ada validasi, tidak enforce min length
 *   - Design system kita pakai Tailwind + rounded-2xl → prompt kelihatan asing
 *   - Textarea proper memungkinkan multi-line explanation yang rapi
 */
export default function MinusReasonModal({ unit, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ESC untuk close (konsisten dengan modal lain)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !submitting) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, submitting]);

  const trimmed = reason.trim();
  const isValid = trimmed.length >= MIN_CHARS;
  const charCount = trimmed.length;

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(trimmed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => !submitting && onClose()} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden">

        {/* Header merah — penanda tindakan serius */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0 bg-gradient-to-r from-red-600 to-red-700">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Ban className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Tandai MINUS</p>
              <h2 className="text-white font-bold text-sm mt-0.5 truncate">{unit.name}</h2>
            </div>
          </div>
          <button
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/70 hover:bg-white/15 disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {/* Info box */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-800 leading-relaxed">
              <p className="font-semibold mb-0.5">Unit akan dilempar ke Pengelola Barang</p>
              <p className="text-amber-700/90">
                Jelaskan masalahnya sedetail mungkin. Alasan ini jadi <span className="font-mono bg-white px-1 rounded">analisa</span> awal yang dibaca Pengelola Barang untuk memutuskan: Perbaiki / Minus Siap Jual / Aset Matot.
              </p>
            </div>
          </div>

          {/* SN info */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">SN</span>
            <span className="text-xs font-mono text-gray-700 font-semibold">{unit.sn || "— tanpa SN —"}</span>
          </div>

          {/* Textarea alasan */}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
              Alasan MINUS <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              rows={5}
              autoFocus
              placeholder="Contoh: Layar bergaris horizontal, keyboard beberapa tombol tidak berfungsi (F1, Tab), baterai drop 30% dalam 1 jam..."
              className={`w-full border-2 rounded-xl px-3 py-2.5 text-sm focus:outline-none transition resize-none ${
                charCount === 0
                  ? "border-gray-200 bg-gray-50 focus:border-red-400 focus:bg-white"
                  : isValid
                    ? "border-emerald-200 bg-emerald-50/30 focus:border-emerald-400 focus:bg-white"
                    : "border-amber-300 bg-amber-50/30 focus:border-amber-400 focus:bg-white"
              }`}
            />
            <div className="flex items-center justify-between mt-1.5">
              <p className={`text-[10px] ${charCount === 0 ? "text-gray-400" : isValid ? "text-emerald-600" : "text-amber-600"}`}>
                {charCount === 0
                  ? `Minimal ${MIN_CHARS} karakter`
                  : isValid
                    ? "Alasan valid"
                    : `Kurang ${MIN_CHARS - charCount} karakter lagi`}
              </p>
              <p className="text-[10px] text-gray-400 font-mono">{charCount} chars</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0 bg-white">
          <button
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-200 transition disabled:opacity-40"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="flex-1 h-10 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl text-xs font-semibold hover:from-red-700 hover:to-red-800 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {submitting ? "Memproses..." : "Tandai MINUS"}
          </button>
        </div>
      </div>
    </div>
  );
}