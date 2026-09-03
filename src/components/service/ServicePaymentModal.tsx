"use client";
// src/components/service/ServicePaymentModal.tsx

import { useState, useEffect, useRef } from "react";
import { Banknote, Landmark, QrCode, Wallet, Check, Upload, Loader2, Camera, Image as ImageIcon } from "lucide-react";
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
    pickup_type?: "SERVICE" | "GARANSI";
    payment_status?: "LUNAS" | "DP";
    total_tagihan?: number;
    payment_proof_url?: string; //  NEW
  }) => Promise<void>;
}

type PickupType = "service" | "garansi";

const METHOD_OPTIONS = [
  { value: "CASH", label: "Cash / Tunai", icon: Banknote },
  { value: "TRANSFER", label: "Transfer Bank", icon: Landmark },
  { value: "QRIS", label: "QRIS", icon: QrCode },
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
  const [dpAmount, setDpAmount] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<"CASH" | "TRANSFER" | "QRIS">("CASH");
  const [isDpMode, setIsDpMode] = useState(false); const [hasilAnalisa, setHasilAnalisa] = useState("");

  //  NEW — bukti pembayaran, wajib diisi untuk mode Service (Lunas/DP), tidak untuk Garansi
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false); //  NEW — toggle popup Kamera/Galeri
  const fileInputRef = useRef<HTMLInputElement>(null); // input untuk pilih dari Galeri
  const cameraInputRef = useRef<HTMLInputElement>(null); //  NEW — input khusus buka Kamera

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !order) return;
    if (pickupType !== "service") return;
    const est = Number(order.estimasi_harga ?? 0);
    const sp = Number(order.biaya_sparepart ?? 0);
    const total = est + sp;
    setAmount(prev => (prev ? prev : total > 0 ? fmtRupiah(total) : ""));
  }, [open, order, pickupType]);

  if (!open || !order) return null;
  const handleAmountChange = (v: string) => {
    const digits = v.replace(/\D/g, "");
    setAmount(digits ? fmtRupiah(parseInt(digits)) : "");
  };

  const handleDpAmountChange = (v: string) => { //  NEW
    const digits = v.replace(/\D/g, "");
    setDpAmount(digits ? fmtRupiah(parseInt(digits)) : "");
  };

  //  NEW — upload foto bukti pembayaran ke storage
  const handleFileSelect = async (file: File | null) => {
    if (!file) return;
    setError("");

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Format foto harus JPG, PNG, atau WEBP");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Ukuran foto maksimal 5MB");
      return;
    }

    setProofPreview(URL.createObjectURL(file));
    setProofUrl(null);
    setUploading(true);

    try {
      const fd = new FormData();
      fd.append("file", file);
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

  const handleRemoveProof = () => { //  NEW
    setProofPreview(null);
    setProofUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = ""; //  NEW
  };

  const handleConfirm = async () => {
    const amountNum = isGaransi ? 0 : parseRupiah(amount);
    const isDp = !isGaransi && isDpMode;
    const dpAmountNum = isDp ? parseRupiah(dpAmount) : 0;

    if (!isGaransi && (!amountNum || amountNum <= 0)) {
      setError("Jumlah biaya wajib diisi dan harus lebih dari 0");
      return;
    }
    if (isDp) { //  NEW — validasi nominal DP
      if (!dpAmountNum || dpAmountNum <= 0) {
        setError("Nominal DP wajib diisi dan harus lebih dari 0");
        return;
      }
      if (dpAmountNum > amountNum) {
        setError("Nominal DP tidak boleh melebihi Total Biaya Servis");
        return;
      }
    }
    if (!isGaransi && !proofUrl) { //  NEW — foto bukti wajib untuk mode Service (Lunas/DP)
      setError("Foto bukti pembayaran wajib diupload");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onConfirm({
        payment_amount: isDp ? dpAmountNum : amountNum, //  NEW — kalau DP, kirim nominal DP saja
        payment_note: note.trim(),
        payment_method: isGaransi ? "CASH" : method,
        hasil_analisa: hasilAnalisa.trim() || undefined,
        pickup_type: isGaransi ? "GARANSI" : "SERVICE",
        payment_status: isDp ? "DP" : "LUNAS", //  NEW
        total_tagihan: isGaransi ? undefined : amountNum, //  NEW
        payment_proof_url: !isGaransi ? (proofUrl ?? undefined) : undefined, //  NEW
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
    setDpAmount("");
    setNote("");
    setMethod("CASH");
    setIsDpMode(false); // FIX
    setHasilAnalisa("");
    setProofPreview(null); //  NEW
    setProofUrl(null); //  NEW
    setUploading(false); //  NEW
    setShowPhotoOptions(false); //  NEW
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = ""; //  NEW
    if (cameraInputRef.current) cameraInputRef.current.value = ""; //  NEW
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
  const isDp = !isGaransi && isDpMode;
  const dpAmountNum = parseRupiah(dpAmount);

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

          {/*  Metode Pembayaran — HANYA tampil kalau Service, disembunyikan kalau Garansi */}
          {!isGaransi && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Metode Pembayaran</label>
              <div className="grid grid-cols-3 gap-2">
                {METHOD_OPTIONS.map(m => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.value}
                      onClick={() => setMethod(m.value)}
                      className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-xs font-semibold transition ${method === m.value
                        ? "border-[#1a1a2e] bg-[#1a1a2e]/5 text-[#1a1a2e]"
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                    >
                      <Icon className="w-5 h-5" />
                      {m.label}
                    </button>
                  );
                })}
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
              {(Number(order.estimasi_harga ?? 0) > 0 || Number(order.biaya_sparepart ?? 0) > 0) && (
                <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                  Prefill: estimasi <strong>Rp {Number(order.estimasi_harga ?? 0).toLocaleString("id-ID")}</strong>
                  {" + "}sparepart <strong>Rp {Number(order.biaya_sparepart ?? 0).toLocaleString("id-ID")}</strong>. Bisa diedit.
                </p>
              )}
            </div>
          )}

          {!isGaransi && (
            <label className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl border-2 border-gray-200 cursor-pointer transition hover:border-amber-300">
              <input
                type="checkbox"
                checked={isDpMode}
                onChange={e => setIsDpMode(e.target.checked)}
                className="w-4 h-4 rounded accent-amber-500"
              />
              <Wallet className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <span className="text-xs font-semibold text-gray-700">
                Ini pembayaran DP (belum lunas penuh)
              </span>
            </label>
          )}

          {isDp && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Nominal DP (Dibayar Sekarang)
                <span className="text-red-500 ml-0.5">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">Rp</span>
                <input
                  type="text"
                  value={dpAmount}
                  onChange={e => handleDpAmountChange(e.target.value)}
                  placeholder="0"
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition font-mono"
                />
              </div>
              {dpAmountNum > 0 && (
                <p className="text-xs text-amber-600 mt-1 font-medium">
                  {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(dpAmountNum)}
                  {amountNum > 0 && ` · Sisa ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Math.max(amountNum - dpAmountNum, 0))}`}
                </p>
              )}
            </div>
          )}

          {/*  NEW — Bukti Pembayaran, wajib untuk mode Service (Lunas/DP) */}
          {!isGaransi && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Foto Bukti Pembayaran
                <span className="text-red-500 ml-0.5">*</span>
              </label>

              {!proofPreview ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowPhotoOptions(v => !v)}
                    className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-[#1a1a2e]/30 hover:text-[#1a1a2e] transition"
                  >
                    <Upload className="w-5 h-5" />
                    <span className="text-xs font-semibold">Upload foto bukti transfer / pembayaran</span>
                    <span className="text-[10px] text-gray-300">JPG, PNG, atau WEBP · maks 5MB</span>
                  </button>

                  {/*  NEW — popup pilihan sumber foto: Kamera atau Galeri */}
                  {showPhotoOptions && (
                    <>
                      <div
                        className="fixed inset-0 z-[70]"
                        onClick={() => setShowPhotoOptions(false)}
                      />
                      <div className="absolute left-0 right-0 top-full mt-2 z-[80] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                        <button
                          type="button"
                          onClick={() => {
                            setShowPhotoOptions(false);
                            cameraInputRef.current?.click();
                          }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                        >
                          <Camera className="w-4 h-4 text-[#1a1a2e]" />
                          Ambil dari Kamera
                        </button>
                        <div className="h-px bg-gray-100" />
                        <button
                          type="button"
                          onClick={() => {
                            setShowPhotoOptions(false);
                            fileInputRef.current?.click();
                          }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                        >
                          <ImageIcon className="w-4 h-4 text-[#1a1a2e]" />
                          Pilih dari Galeri
                        </button>
                      </div>
                    </>
                  )}
                </div>
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
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

              {/*  NEW — input khusus kamera; capture="environment" langsung buka kamera belakang di HP */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={e => handleFileSelect(e.target.files?.[0] ?? null)}
              />
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
            disabled={loading || uploading || (!isGaransi && !amountNum) || (isDp && !dpAmountNum) || (!isGaransi && !proofUrl)}
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
            ) : isGaransi ? (
              <><Check className="w-4 h-4" /> Konfirmasi Klaim Garansi</>
            ) : isDp ? (
              <><Check className="w-4 h-4" /> Konfirmasi DP</>
            ) : (
              <><Check className="w-4 h-4" /> Konfirmasi Diambil</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}