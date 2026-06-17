"use client";
// src/components/service/ServicePaymentModal.tsx

import { useState } from "react";
import type { ServiceOrder } from "@/types/service";

interface Props {
  open: boolean;
  order: ServiceOrder | null;
  onClose: () => void;
  onConfirm: (payment: {
    payment_amount: number;
    payment_note: string;
    payment_method: "CASH" | "TRANSFER" | "QRIS";
    hasil_analisa?: string;
  }) => Promise<void>;
}

const METHOD_OPTIONS = [
  { value: "CASH", label: "Cash / Tunai", icon: "💵" },
  { value: "TRANSFER", label: "Transfer Bank", icon: "🏦" },
  { value: "QRIS", label: "QRIS", icon: "📱" },
] as const;

function fmtRupiah(n: number) {
  if (!n) return "";
  return new Intl.NumberFormat("id-ID").format(n);
}

function parseRupiah(s: string) {
  return parseInt(s.replace(/\D/g, ""), 10) || 0;
}

export default function ServicePaymentModal({ open, order, onClose, onConfirm }: Props) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<"CASH" | "TRANSFER" | "QRIS">("CASH");
  const [hasilAnalisa, setHasilAnalisa] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open || !order) return null;

  const handleAmountChange = (v: string) => {
    const digits = v.replace(/\D/g, "");
    setAmount(digits ? fmtRupiah(parseInt(digits)) : "");
  };

  const handleConfirm = async () => {
    const amountNum = parseRupiah(amount);
    if (!amountNum || amountNum <= 0) {
      setError("Jumlah biaya wajib diisi dan harus lebih dari 0");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onConfirm({
        payment_amount: amountNum,
        payment_note: note.trim(),
        payment_method: method,
        hasil_analisa: hasilAnalisa.trim() || undefined,
      });
      // Reset
      setAmount("");
      setNote("");
      setMethod("CASH");
      setHasilAnalisa("");
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan payment");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setAmount("");
    setNote("");
    setMethod("CASH");
    setHasilAnalisa("");
    setError("");
    onClose();
  };

  const amountNum = parseRupiah(amount);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-[#1a1a2e]">Konfirmasi Diambil & Payment</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {order.nama} · {order.type_laptop}
              </p>
            </div>
            <button onClick={handleClose} disabled={loading} className="p-2 rounded-xl text-gray-400 hover:bg-gray-50 transition">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Info pelanggan */}
          <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100">
            {[
              { label: "Pelanggan", value: order.nama },
              { label: "No HP", value: order.no_hp },
              { label: "Laptop", value: `${order.type_laptop}${order.cpu ? ` · ${order.cpu}` : ""}` },
              { label: "Keluhan", value: order.keluhan },
            ].map(r => (
              <div key={r.label} className="flex gap-3 px-4 py-2.5">
                <span className="text-xs text-gray-400 w-24 flex-shrink-0 font-medium pt-0.5">{r.label}</span>
                <span className="text-sm text-gray-700 break-words min-w-0">{r.value}</span>
              </div>
            ))}
          </div>

          {/* Hasil Analisa */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Hasil Analisa
              <span className="text-gray-400 font-normal ml-1">(opsional)</span>
            </label>
            <textarea
              value={hasilAnalisa}
              onChange={e => setHasilAnalisa(e.target.value)}
              placeholder={order.hasil_analisa || "Tulis hasil analisa / keterangan perbaikan..."}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition resize-none placeholder:text-gray-300"
            />
          </div>

          {/* Metode Pembayaran */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Metode Pembayaran</label>
            <div className="grid grid-cols-3 gap-2">
              {METHOD_OPTIONS.map(m => (
                <button
                  key={m.value}
                  onClick={() => setMethod(m.value)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-xs font-semibold transition ${
                    method === m.value
                      ? "border-[#1a1a2e] bg-[#1a1a2e]/5 text-[#1a1a2e]"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <span className="text-lg">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Jumlah Biaya */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Total Biaya Servis <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">Rp</span>
              <input
                type="text"
                value={amount}
                onChange={e => handleAmountChange(e.target.value)}
                placeholder="0"
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition font-mono"
              />
            </div>
            {amountNum > 0 && (
              <p className="text-xs text-emerald-600 mt-1 font-medium">
                {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amountNum)}
              </p>
            )}
          </div>

          {/* Catatan */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Catatan Payment
              <span className="text-gray-400 font-normal ml-1">(opsional)</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="cth: Sudah termasuk sparepart baterai"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition placeholder:text-gray-300"
            />
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
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
            className="flex-2 px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : "✓ Konfirmasi Diambil"}
          </button>
        </div>
      </div>
    </div>
  );
}