"use client";
// src/components/service/ServiceCicilanModal.tsx
//  NEW — popup nominal cicilan untuk order yang statusnya payment_status === "DP"

import { useState } from "react";
import { Check } from "lucide-react";
import type { ServiceOrder } from "@/types/service";

interface Props {
  open: boolean;
  order: ServiceOrder | null;
  onClose: () => void;
  onConfirm: (cicilanAmount: number) => Promise<void>;
}

function fmtRupiah(n: number) {
  if (!n) return "";
  return new Intl.NumberFormat("id-ID").format(n);
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function parseRupiah(s: string) {
  return parseInt(s.replace(/\D/g, ""), 10) || 0;
}

export default function ServiceCicilanModal({ open, order, onClose, onConfirm }: Props) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open || !order) return null;

  const total = Number(order.total_tagihan ?? 0);
  const sudahDibayar = Number(order.payment_amount ?? 0);
  const sisa = Math.max(total - sudahDibayar, 0);
  const amountNum = parseRupiah(amount);

  const handleAmountChange = (v: string) => {
    const digits = v.replace(/\D/g, "");
    setAmount(digits ? fmtRupiah(parseInt(digits)) : "");
  };

  const resetForm = () => {
    setAmount("");
    setError("");
  };

  const handleClose = () => {
    if (loading) return;
    resetForm();
    onClose();
  };

  const handleConfirm = async () => {
    if (!amountNum || amountNum <= 0) {
      setError("Nominal cicilan wajib diisi dan harus lebih dari 0");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onConfirm(amountNum);
      resetForm();
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan cicilan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-[#1a1a2e]">Bayar Cicilan</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {order.nama} · {order.type_laptop}
              </p>
            </div>
            <button
              onClick={handleClose}
              disabled={loading}
              className="p-2 rounded-xl text-gray-400 hover:bg-gray-50 transition"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Ringkasan tagihan */}
          <div className="bg-amber-50 rounded-xl border border-amber-100 divide-y divide-amber-100">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs font-medium text-gray-500">Total Tagihan</span>
              <span className="text-sm font-bold text-gray-700">{fmtCurrency(total)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs font-medium text-gray-500">Sudah Dibayar (DP)</span>
              <span className="text-sm font-bold text-emerald-600">{fmtCurrency(sudahDibayar)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs font-bold text-amber-700">Sisa Tagihan</span>
              <span className="text-sm font-black text-amber-700">{fmtCurrency(sisa)}</span>
            </div>
          </div>

          {/* Nominal cicilan */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Nominal Dibayar Sekarang
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">Rp</span>
              <input
                type="text"
                value={amount}
                onChange={e => handleAmountChange(e.target.value)}
                placeholder="0"
                autoFocus
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition font-mono"
              />
            </div>
            {amountNum > 0 && (
              <p className="text-xs mt-1 font-medium text-gray-500">
                {amountNum >= sisa
                  ? " Nominal ini melunasi sisa tagihan — order akan pindah ke Riwayat."
                  : `Sisa setelah ini: ${fmtCurrency(Math.max(sisa - amountNum, 0))}`}
              </p>
            )}
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-2">
          <button
            onClick={handleClose}
            disabled={loading}
            className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-xl transition"
          >
            Batal
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !amountNum}
            className="flex-2 px-6 py-2.5 text-sm font-semibold text-white rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600"
          >
            {loading ? (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <><Check className="w-4 h-4" /> Konfirmasi Cicilan</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}