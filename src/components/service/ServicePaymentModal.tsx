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
    pickup_type?: "SERVICE" | "GARANSI"; // opsional, bisa disimpan di log/note
  }) => Promise<void>;
}

type PickupType = "service" | "garansi";

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
  // Step 1: pilih tipe pickup. null = belum pilih (tampil screen pilihan)
  const [pickupType, setPickupType] = useState<PickupType | null>(null);

  // Form fields
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
    const amountNum = isGaransi ? 0 : parseRupiah(amount);
    if (!isGaransi && (!amountNum || amountNum <= 0)) {
      setError("Jumlah biaya wajib diisi dan harus lebih dari 0");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onConfirm({
        payment_amount: amountNum,
        payment_note: note.trim(),
        payment_method: isGaransi ? "CASH" : method,
        hasil_analisa: hasilAnalisa.trim() || undefined,
        pickup_type: isGaransi ? "GARANSI" : "SERVICE",
      });
      // Reset semua state
      resetForm();
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan payment");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setPickupType(null);
    setAmount("");
    setNote("");
    setMethod("CASH");
    setHasilAnalisa("");
    setError("");
  };

  const handleClose = () => {
    if (loading) return;
    resetForm();
    onClose();
  };

  const handleBack = () => {
    setPickupType(null);
    setError("");
  };

  const amountNum = parseRupiah(amount);
  const isGaransi = pickupType === "garansi";

  // ─────────────────────────────────────────────
  // SCREEN 1: Pilihan tipe pickup
  // ─────────────────────────────────────────────
  if (pickupType === null) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

        <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-[#1a1a2e]">Konfirmasi Pengambilan</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {order.nama} · {order.type_laptop}
                </p>
              </div>
              <button
                onClick={handleClose}
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
          <div className="px-6 py-5">
            <p className="text-sm text-gray-600 mb-4">
              Pilih jenis pengambilan untuk order ini:
            </p>

            <div className="space-y-2.5">
              {/* Opsi: Service */}
              <button
                onClick={() => setPickupType("service")}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-200 hover:border-[#1a1a2e] hover:bg-[#1a1a2e]/5 transition text-left group"
              >
                <div className="w-9 h-9 rounded-xl bg-[#1a1a2e]/10 group-hover:bg-[#1a1a2e]/15 flex items-center justify-center flex-shrink-0 transition">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-[#1a1a2e]">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">Service</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Payment lengkap dengan pilihan metode pembayaran
                  </p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-300 group-hover:text-[#1a1a2e] transition flex-shrink-0">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {/* Opsi: Klaim Garansi */}
              <button
                onClick={() => setPickupType("garansi")}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-200 hover:border-amber-400 hover:bg-amber-50 transition text-left group"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center flex-shrink-0 transition">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-amber-600">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">Klaim Garansi</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Tanpa pilihan metode — biaya garansi / penanganan
                  </p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-300 group-hover:text-amber-500 transition flex-shrink-0">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pb-5">
            <button
              onClick={handleClose}
              className="w-full py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // SCREEN 2: Form payment
  // ─────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                {/* Tombol back ke pilihan tipe */}
                <button
                  onClick={handleBack}
                  disabled={loading}
                  className="p-1 -ml-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                  title="Kembali"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <h2 className="text-base font-bold text-[#1a1a2e]">
                  {isGaransi ? "Klaim Garansi" : "Konfirmasi Diambil & Payment"}
                </h2>
              </div>
              <p className="text-xs text-gray-400">
                {order.nama} · {order.type_laptop}
              </p>
            </div>

            <div className="flex items-center gap-1.5 ml-2">
              {/* Badge tipe */}
              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide ${isGaransi
                  ? "bg-amber-100 text-amber-700"
                  : "bg-[#1a1a2e]/10 text-[#1a1a2e]"
                }`}>
                {isGaransi ? "Garansi" : "Service"}
              </span>
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
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Banner info garansi */}
          {isGaransi && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500 mt-0.5 flex-shrink-0">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <p className="text-xs text-amber-700">
                Mode <strong>Klaim Garansi</strong> — metode pembayaran tidak ditampilkan.
                Isi nominal biaya jika ada biaya penanganan yang dikenakan.
              </p>
            </div>
          )}

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

          {/* ✅ Metode Pembayaran — HANYA tampil kalau Service, disembunyikan kalau Garansi */}
          {!isGaransi && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Metode Pembayaran</label>
              <div className="grid grid-cols-3 gap-2">
                {METHOD_OPTIONS.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setMethod(m.value)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-xs font-semibold transition ${method === m.value
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
          )}

          {/* Jumlah Biaya — hanya tampil kalau Service */}
          {!isGaransi && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Total Biaya Servis
                <span className="text-red-500 ml-0.5">*</span>
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
          )}

          {/* Catatan */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Catatan
              <span className="text-gray-400 font-normal ml-1">(opsional)</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={
                isGaransi
                  ? "cth: Garansi penggantian layar"
                  : "cth: Sudah termasuk sparepart baterai"
              }
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
            disabled={loading || (!isGaransi && !amountNum)}
            className={`flex-2 px-6 py-2.5 text-sm font-semibold text-white rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2 ${isGaransi
                ? "bg-amber-500 hover:bg-amber-600"
                : "bg-emerald-600 hover:bg-emerald-700"
              }`}
          >
            {loading ? (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : isGaransi ? "✓ Konfirmasi Klaim Garansi" : "✓ Konfirmasi Diambil"}
          </button>
        </div>
      </div>
    </div>
  );
}