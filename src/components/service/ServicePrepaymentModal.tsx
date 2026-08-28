"use client";
// src/components/service/ServicePrepaymentModal.tsx

import { useState, useRef } from "react";
import { Banknote, Landmark, QrCode, Check, Upload, X, Loader2 } from "lucide-react";
import type { ServiceOrder } from "@/types/service";
import { compressImage } from "@/lib/imageCompression";

interface Props {
  open: boolean;
  order: ServiceOrder | null;
  onClose: () => void;
  onConfirm: (payload: {
    payment_amount: number;
    payment_status: "LUNAS" | "DP";
    total_tagihan?: number;
    payment_method: "CASH" | "TRANSFER" | "QRIS";
    payment_note?: string;
    payment_proof_url: string;
  }) => Promise<void>;
}

const METHOD_OPTIONS = [
  { value: "CASH", label: "Cash", icon: Banknote },
  { value: "TRANSFER", label: "Transfer", icon: Landmark },
  { value: "QRIS", label: "QRIS", icon: QrCode },
] as const;

function fmtRupiah(n: number) {
  if (!n) return "";
  return new Intl.NumberFormat("id-ID").format(n);
}
function parseRupiah(s: string) {
  return parseInt(s.replace(/\D/g, ""), 10) || 0;
}

export default function ServicePrepaymentModal({ open, order, onClose, onConfirm }: Props) {
  const [status, setStatus] = useState<"LUNAS" | "DP">("LUNAS");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"CASH" | "TRANSFER" | "QRIS">("CASH");
  const [note, setNote] = useState("");

  // ── Bukti pembayaran — WAJIB ──
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open || !order) return null;

  const amountNum = parseRupiah(amount);

  const resetForm = () => {
    setStatus("LUNAS");
    setAmount("");
    setMethod("CASH");
    setNote("");
    setProofPreview(null);
    setProofUrl(null);
    setUploading(false);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    if (loading || uploading) return;
    resetForm();
    onClose();
  };

  const handleAmountChange = (v: string) => {
    const digits = v.replace(/\D/g, "");
    setAmount(digits ? fmtRupiah(parseInt(digits)) : "");
  };

   const handleFileSelect = async (file: File | null) => {
    if (!file) return;
    setError("");

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Format foto harus JPG, PNG, atau WEBP");
      return;
    }

    setUploading(true);
    const compressedFile = await compressImage(file, { maxSizeMB: 1, maxWidthOrHeight: 1920 });

    if (compressedFile.size > 5 * 1024 * 1024) {
      setError("Ukuran foto masih terlalu besar setelah dikompres, coba foto lain");
      setUploading(false);
      return;
    }

    setProofPreview(URL.createObjectURL(compressedFile));
    setProofUrl(null);

    try {
      const fd = new FormData();
      fd.append("file", compressedFile);
      fd.append("order_id", order.id);
      const res = await fetch("/api/service/upload-payment-proof", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Gagal upload bukti pembayaran");
      setProofUrl(json.data.url);
    } catch (e: any) {
      setError(e.message || "Gagal upload bukti pembayaran");
      setProofPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveProof = () => {
    setProofPreview(null);
    setProofUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleConfirm = async () => {
    if (!amountNum || amountNum <= 0) {
      setError("Nominal dibayar wajib diisi dan harus lebih dari 0");
      return;
    }
    if (!proofUrl) {
      setError("Foto bukti pembayaran wajib diupload sebelum menyimpan");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onConfirm({
        payment_amount: amountNum,
        payment_status: status,
        total_tagihan: status === "DP" ? amountNum : undefined,
        payment_method: method,
        payment_note: note.trim() || undefined,
        payment_proof_url: proofUrl,
      });
      resetForm();
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan pembayaran");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !loading && !uploading && amountNum > 0 && !!proofUrl;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-[#1a1a2e]">Bayar di Muka</h2>
            <p className="text-xs text-gray-400 mt-0.5">{order.nama} · {order.type_laptop}</p>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-2 rounded-xl text-gray-400 hover:bg-gray-50 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Status Pembayaran */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Status Pembayaran</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStatus("LUNAS")}
                className={`py-2.5 rounded-xl border-2 text-sm font-bold transition ${
                  status === "LUNAS" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500"
                }`}
              >
                Lunas
              </button>
              <button
                type="button"
                onClick={() => setStatus("DP")}
                className={`py-2.5 rounded-xl border-2 text-sm font-bold transition ${
                  status === "DP" ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-200 text-gray-500"
                }`}
              >
                DP (Cicil)
              </button>
            </div>
          </div>

          {/* Nominal */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Nominal Dibayar<span className="text-red-500 ml-0.5">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">Rp</span>
              <input
                type="text"
                value={amount}
                onChange={e => handleAmountChange(e.target.value)}
                placeholder="cth: 200000"
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition font-mono"
              />
            </div>
          </div>

          {/* Metode Pembayaran */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Metode Pembayaran</label>
            <div className="grid grid-cols-3 gap-2">
              {METHOD_OPTIONS.map(m => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMethod(m.value)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-xs font-semibold transition ${
                      method === m.value ? "border-[#1a1a2e] bg-[#1a1a2e]/5 text-[#1a1a2e]" : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bukti Pembayaran — WAJIB */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Foto Bukti Pembayaran<span className="text-red-500 ml-0.5">*</span>
            </label>

            {!proofPreview ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-[#1a1a2e]/30 hover:text-[#1a1a2e] transition"
              >
                <Upload className="w-5 h-5" />
                <span className="text-xs font-semibold">Upload foto bukti transfer / pembayaran</span>
                <span className="text-[10px] text-gray-300">JPG, PNG, atau WEBP · maks 5MB</span>
              </button>
            ) : (
              <div className="relative w-full overflow-hidden rounded-xl border border-gray-200">
                <img src={proofPreview} alt="Bukti pembayaran" className="w-full max-h-56 object-contain bg-gray-50" />
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-white/80 text-xs font-semibold text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Mengupload...
                  </div>
                )}
                {!uploading && proofUrl && (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
                    <Check className="w-3 h-3" /> Terupload
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleRemoveProof}
                  disabled={uploading}
                  className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-lg bg-black/60 text-white hover:bg-black/80 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={e => handleFileSelect(e.target.files?.[0] ?? null)}
            />
          </div>

          {/* Catatan */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Catatan <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="cth: Bayar via transfer BCA a.n. ..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition resize-none placeholder:text-gray-300"
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
            disabled={!canSubmit}
            className="flex-[2] px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Simpan Pembayaran
          </button>
        </div>
      </div>
    </div>
  );
}