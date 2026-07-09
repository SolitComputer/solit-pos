"use client";
// src/components/service/ServicePriceDialog.tsx
// Reusable: input harga (rupiah) + opsional keterangan.
// Dipakai untuk aksi "mulai" (estimasi) & "sparepart" (biaya + keterangan).

import { useState, useEffect } from "react";

interface ServicePriceDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass?: string;
  priceLabel?: string;
  pricePlaceholder?: string;
  priceRequired?: boolean;
  defaultPrice?: number;
  withReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonRequired?: boolean;
  onCancel: () => void;
  onConfirm: (price: number, reason?: string) => Promise<void>;
}

function fmtRupiah(n: number) {
  if (!n) return "";
  return new Intl.NumberFormat("id-ID").format(n);
}
function parseRupiah(s: string) {
  return parseInt(s.replace(/\D/g, ""), 10) || 0;
}

export default function ServicePriceDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmClass = "bg-[#1a1a2e] hover:bg-[#2d2d4a]",
  priceLabel = "Nominal",
  pricePlaceholder = "0",
  priceRequired = false,
  defaultPrice = 0,
  withReason = false,
  reasonLabel = "Keterangan",
  reasonPlaceholder = "Tulis keterangan...",
  reasonRequired = false,
  onCancel,
  onConfirm,
}: ServicePriceDialogProps) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Reset & prefill tiap kali dialog dibuka
  useEffect(() => {
    if (open) {
      setAmount(defaultPrice > 0 ? fmtRupiah(defaultPrice) : "");
      setReason("");
      setError("");
    }
  }, [open, defaultPrice]);

  if (!open) return null;

  const amountNum = parseRupiah(amount);

  const handleAmountChange = (v: string) => {
    const digits = v.replace(/\D/g, "");
    setAmount(digits ? fmtRupiah(parseInt(digits)) : "");
    setError("");
  };

  const handleConfirm = async () => {
    if (priceRequired && amountNum <= 0) {
      setError(`${priceLabel} wajib diisi dan lebih dari 0.`);
      return;
    }
    if (withReason && reasonRequired && !reason.trim()) {
      setError(`${reasonLabel} wajib diisi.`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onConfirm(amountNum, withReason ? reason.trim() : undefined);
      setAmount("");
      setReason("");
    } catch (e: any) {
      setError(e.message || "Terjadi kesalahan, coba lagi");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (loading) return;
    setAmount("");
    setReason("");
    setError("");
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCancel} />

      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-gray-600">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="text-sm font-bold text-gray-900">{title}</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>
            </div>
          </div>
        </div>

        {/* Price input */}
        <div className="px-5 pb-3">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            {priceLabel}
            {priceRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">Rp</span>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={e => handleAmountChange(e.target.value)}
              placeholder={pricePlaceholder}
              disabled={loading}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition font-mono disabled:opacity-60"
            />
          </div>
          {amountNum > 0 && (
            <p className="text-xs text-emerald-600 mt-1 font-medium">
              {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amountNum)}
            </p>
          )}
        </div>

        {/* Reason (opsional) */}
        {withReason && (
          <div className="px-5 pb-4">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              {reasonLabel}
              {reasonRequired && <span className="text-red-500 ml-0.5">*</span>}
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