"use client";
// src/components/service/ServiceConfirmDialog.tsx
// Konfirmasi 1 langkah — lebih simpel dan langsung

import { useState } from "react";

interface ServiceConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass?: string;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onCancel: () => void;
  onConfirm: (reason?: string) => Promise<void>;
}

export default function ServiceConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmClass = "bg-[#1a1a2e] hover:bg-[#2d2d4a]",
  requireReason = false,
  reasonLabel = "Alasan",
  reasonPlaceholder = "Tulis alasan...",
  onCancel,
  onConfirm,
}: ServiceConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleConfirm = async () => {
    if (requireReason && !reason.trim()) {
      setError(`${reasonLabel} wajib diisi.`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onConfirm(requireReason ? reason.trim() : undefined);
      // Reset setelah sukses
      setReason("");
    } catch (e: any) {
      setError(e.message || "Terjadi kesalahan, coba lagi");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (loading) return;
    setReason("");
    setError("");
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleCancel}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
              <svg
                width="16" height="16" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.2"
                className="text-gray-600"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="text-sm font-bold text-gray-900">{title}</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>
            </div>
          </div>
        </div>

        {/* Reason input (jika diperlukan) */}
        {requireReason && (
          <div className="px-5 pb-4">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              {reasonLabel} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => { setReason(e.target.value); setError(""); }}
              placeholder={reasonPlaceholder}
              rows={3}
              disabled={loading}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition resize-none placeholder:text-gray-300 disabled:opacity-60"
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-5 mb-4 px-3 py-2 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={handleCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-xl transition disabled:opacity-60"
          >
            Batal
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition disabled:opacity-60 flex items-center justify-center gap-2 ${confirmClass}`}
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Memproses...
              </>
            ) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}