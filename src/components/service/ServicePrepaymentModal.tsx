"use client";
// src/components/service/ServicePrepaymentModal.tsx

import { useEffect, useState } from "react";
import type { ServiceOrder } from "@/types/service";

interface ServicePrepaymentModalProps {
  open: boolean;
  order: ServiceOrder | null;
  onClose: () => void;
  onConfirm: (payload: {
    payment_amount: number;
    payment_status: "LUNAS" | "DP";
    total_tagihan?: number;
    payment_method: "CASH" | "TRANSFER" | "QRIS";
    payment_note?: string;
  }) => Promise<void>;
}

type StatusBayar = "LUNAS" | "DP";
type Metode = "CASH" | "TRANSFER" | "QRIS";

export default function ServicePrepaymentModal({
  open,
  order,
  onClose,
  onConfirm,
}: ServicePrepaymentModalProps) {
  const [statusBayar, setStatusBayar] = useState<StatusBayar>("LUNAS");
  const [totalTagihan, setTotalTagihan] = useState("");
  const [nominal, setNominal] = useState("");
  const [metode, setMetode] = useState<Metode>("CASH");
  const [catatan, setCatatan] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Reset form tiap kali modal dibuka untuk order baru
  useEffect(() => {
    if (open) {
      setStatusBayar("LUNAS");
      setTotalTagihan("");
      setNominal("");
      setMetode("CASH");
      setCatatan("");
      setError("");
    }
  }, [open, order?.id]);

  if (!open || !order) return null;

  const nominalNum = Number(nominal) || 0;
  const totalNum = Number(totalTagihan) || 0;

  const handleSubmit = async () => {
    setError("");

    if (nominalNum <= 0) {
      setError("Nominal pembayaran wajib diisi.");
      return;
    }
    if (statusBayar === "DP") {
      if (totalNum <= 0) {
        setError("Total tagihan wajib diisi untuk DP.");
        return;
      }
      if (nominalNum >= totalNum) {
        setError("Nominal DP harus lebih kecil dari total tagihan. Pilih LUNAS jika dibayar penuh.");
        return;
      }
    }

    setLoading(true);
    try {
      await onConfirm({
        payment_amount: nominalNum,
        payment_status: statusBayar,
        total_tagihan: statusBayar === "DP" ? totalNum : nominalNum,
        payment_method: metode,
        payment_note: catatan.trim() || undefined,
      });
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan pembayaran");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#1a1a2e]">Bayar di Muka</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {order.nama} · {order.type_laptop}
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Pilihan status bayar */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Status Pembayaran</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStatusBayar("LUNAS")}
                className={`h-10 rounded-xl border-2 text-sm font-bold transition ${
                  statusBayar === "LUNAS"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 text-gray-400 hover:border-gray-300"
                }`}
              >
                Lunas
              </button>
              <button
                type="button"
                onClick={() => setStatusBayar("DP")}
                className={`h-10 rounded-xl border-2 text-sm font-bold transition ${
                  statusBayar === "DP"
                    ? "border-amber-500 bg-amber-50 text-amber-700"
                    : "border-gray-200 text-gray-400 hover:border-gray-300"
                }`}
              >
                DP (Cicil)
              </button>
            </div>
          </div>

          {/* Total tagihan — hanya untuk DP */}
          {statusBayar === "DP" && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Total Tagihan Disepakati <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                value={totalTagihan}
                onChange={e => setTotalTagihan(e.target.value)}
                placeholder="cth: 500000"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition placeholder:text-gray-300"
              />
            </div>
          )}

          {/* Nominal dibayar */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {statusBayar === "DP" ? "Nominal DP Dibayar Sekarang" : "Nominal Dibayar"} <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              value={nominal}
              onChange={e => setNominal(e.target.value)}
              placeholder="cth: 200000"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition placeholder:text-gray-300"
            />
            {statusBayar === "DP" && totalNum > 0 && nominalNum > 0 && nominalNum < totalNum && (
              <p className="mt-1 text-[11px] font-medium text-amber-500">
                Sisa yang belum dibayar: Rp {(totalNum - nominalNum).toLocaleString("id-ID")}
              </p>
            )}
          </div>

          {/* Metode pembayaran */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Metode Pembayaran</label>
            <div className="grid grid-cols-3 gap-2">
              {(["CASH", "TRANSFER", "QRIS"] as Metode[]).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetode(m)}
                  className={`h-9 rounded-xl border text-xs font-bold transition ${
                    metode === m
                      ? "border-[#1a1a2e] bg-[#1a1a2e] text-white"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Catatan */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Catatan (opsional)</label>
            <textarea
              value={catatan}
              onChange={e => setCatatan(e.target.value)}
              rows={2}
              placeholder="cth: Bayar via transfer BCA a.n. ..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition placeholder:text-gray-300 resize-none"
            />
          </div>

          {error && (
            <div className="px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-xl transition"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition disabled:opacity-60 flex items-center gap-2"
          >
            {loading && (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
            {loading ? "Menyimpan..." : "Simpan Pembayaran"}
          </button>
        </div>
      </div>
    </div>
  );
}