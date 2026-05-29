"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createPaymentSchema, CreatePaymentType } from "@/lib/validation";
import { supabase } from "@/services/supabase";
import imageCompression from "browser-image-compression";

interface Laptop {
  id: string;
  laptop_name: string;
  cpu: string;
  ram: string;
  storage: string;
  serial_number: string;
  selling_price: number;
}

export default function CreatePaymentPage() {
  const [step, setStep] = useState(1);
  const [paymentPhoto, setPaymentPhoto] = useState<File | null>(null);
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [isLoadingLaptops, setIsLoadingLaptops] = useState(true);
  const [rawDealPrice, setRawDealPrice] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } =
    useForm<CreatePaymentType>({
      resolver: zodResolver(createPaymentSchema),
      defaultValues: {
        company_name: "Solit 03",
        payment_method: "CASH",
        pickup_method: "DATANG",
        source_platform: "Instagram",
      },
    });

  const pickupMethod = watch("pickup_method");
  const selectedLaptopId = watch("laptop_id");
  const selectedLaptop = laptops.find((item) => item.id === selectedLaptopId);
  const dealPrice = rawDealPrice;
  const other = selectedLaptop ? dealPrice - selectedLaptop.selling_price : 0;

  useEffect(() => {
    if (!selectedLaptop) return;
    setValue("laptop_name", selectedLaptop.laptop_name);
    setValue("serial_number", selectedLaptop.serial_number);
  }, [selectedLaptop, setValue]);

  useEffect(() => {
    const fetchLaptops = async () => {
      setIsLoadingLaptops(true);
      try {
        const res = await fetch("/api/laptops/ready");
        const result = await res.json();
        setLaptops(result.data || []);
      } catch {
        setLaptops([]);
      } finally {
        setIsLoadingLaptops(false);
      }
    };
    fetchLaptops();
  }, []);

  const getLocation = () => {
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(String(pos.coords.latitude));
        setLongitude(String(pos.coords.longitude));
        setGpsLoading(false);
      },
      () => {
        alert("GPS wajib diaktifkan");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const onSubmit = async (data: CreatePaymentType) => {
    if (!paymentPhoto) { alert("Foto pembayaran wajib diupload"); return; }
    if (!latitude || !longitude) { alert("GPS wajib diambil"); return; }

    setSubmitting(true);
    try {
      const fileName = `${Date.now()}-${paymentPhoto.name}`;
      const { error: uploadError } = await supabase.storage
        .from("payment-proof")
        .upload(fileName, paymentPhoto);
      if (uploadError) { alert("Upload foto gagal"); return; }

      const { data: imageData } = supabase.storage
        .from("payment-proof")
        .getPublicUrl(fileName);

      const res = await fetch("/api/transaction/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          payment_photo: imageData.publicUrl,
          latitude,
          longitude,
        }),
      });
      const result = await res.json();
      if (!result.success) { alert(result.message); return; }
      window.location.href = `/receipt/${result.data.invoice_number}`;
    } catch {
      alert("Terjadi kesalahan");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.1,         
        maxWidthOrHeight: 800,  
        useWebWorker: true,
        initialQuality: 0.7,    
      });
      const result = new File([compressed], file.name, { type: compressed.type });
      setPaymentPhoto(result);
    } catch {
      setPaymentPhoto(file);
    }
  };

  // Style classes yang ditingkatkan
  const inputClass =
    "w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition-all duration-200";
  const selectClass =
    "w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition-all duration-200";
  const btnSecondary =
    "flex-1 h-11 rounded-xl border border-gray-200 bg-white text-gray-600 text-sm font-medium hover:bg-gray-50 hover:border-gray-300 active:scale-[0.97] transition-all duration-200";
  const btnPrimary =
    "flex-1 h-11 rounded-xl bg-[#1a1a2e] text-white text-sm font-medium hover:bg-[#16213e] active:scale-[0.97] transition-all duration-200 shadow-sm";

  const stepLabels = ["Data Pembeli", "Laptop & Harga", "Pengambilan", "Pembayaran"];

  return (
    <div className="max-w-lg mx-auto px-4 py-6 md:py-8">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-lg shadow-gray-100/50 overflow-hidden">
        {/* Header dengan background subtle */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 bg-gradient-to-r from-white to-gray-50/50">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 bg-[#1a1a2e] rounded-lg flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M3 9l9-6 9 6v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-[#1a1a2e] tracking-tight">Buat Payment</h1>
          </div>
          <p className="text-gray-400 text-xs mt-1">Langkah {step} dari 4 — {stepLabels[step - 1]}</p>
        </div>

        <div className="p-6">
          {/* Step indicator - lebih halus */}
          <div className="flex gap-2 mb-8">
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                  step > item
                    ? "bg-[#1a1a2e]"
                    : step === item
                    ? "bg-[#1a1a2e]/40 ring-1 ring-[#1a1a2e]/30"
                    : "bg-gray-100"
                }`}
              />
            ))}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* STEP 1 */}
            {step === 1 && (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Atas Nama <span className="text-red-400">*</span></label>
                  <input type="text" placeholder="Nama lengkap pembeli" className={inputClass} {...register("customer_name")} />
                  {errors.customer_name && <p className="text-xs text-red-500 mt-1">{errors.customer_name.message}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Nama Perusahaan</label>
                  <input type="text" placeholder="Optional" className={inputClass} {...register("company_name")} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">No. WhatsApp <span className="text-red-400">*</span></label>
                  <input type="tel" placeholder="08xx-xxxx-xxxx" className={inputClass} {...register("customer_phone")} />
                  {errors.customer_phone && <p className="text-xs text-red-500 mt-1">{errors.customer_phone.message}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Tahu Solit dari mana?</label>
                  <select className={selectClass} {...register("source_platform")}>
                    {["Instagram", "TikTok", "Facebook", "WhatsApp", "Google", "Shopee", "Tokopedia", "Teman", "Lainnya"].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!watch("customer_name")) { alert("Isi nama customer dulu"); return; }
                      setStep(2);
                    }}
                    className={`w-full ${btnPrimary}`}
                  >
                    Lanjut ke Laptop →
                  </button>
                </div>
              </>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Pilih Laptop <span className="text-red-400">*</span></label>
                  {isLoadingLaptops ? (
                    <div className="h-11 bg-gray-100 rounded-xl animate-pulse" />
                  ) : (
                    <select className={selectClass} {...register("laptop_id")}>
                      <option value="">-- Pilih laptop --</option>
                      {laptops.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.laptop_name} — {item.ram}/{item.storage} — Rp{item.selling_price.toLocaleString("id-ID")}
                        </option>
                      ))}
                    </select>
                  )}
                  {errors.laptop_id && <p className="text-xs text-red-500 mt-1">{errors.laptop_id.message}</p>}
                </div>
                <input type="hidden" {...register("laptop_name")} />
                <input type="hidden" {...register("serial_number")} />

                {selectedLaptop && (
                  <div className="bg-gray-50/80 rounded-xl p-5 border border-gray-100 space-y-3 shadow-inner">
                    <div>
                      <p className="font-semibold text-[#1a1a2e] text-base">{selectedLaptop.laptop_name}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        SN: {selectedLaptop.serial_number} · {selectedLaptop.cpu} · {selectedLaptop.ram} · {selectedLaptop.storage}
                      </p>
                    </div>
                    <div className="flex justify-between text-sm py-2 border-t border-gray-200">
                      <span className="text-gray-500">Harga inventory</span>
                      <span className="font-medium text-gray-800">Rp{selectedLaptop.selling_price.toLocaleString("id-ID")}</span>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1.5 block">Harga Deal <span className="text-red-400">*</span></label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Masukkan harga deal"
                        className={inputClass}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, "");
                          const num = raw ? Number(raw) : 0;
                          setRawDealPrice(num);
                          setValue("amount", num);
                        }}
                        onBlur={(e) => {
                          const raw = e.target.value.replace(/\D/g, "");
                          if (raw) e.target.value = Number(raw).toLocaleString("id-ID");
                        }}
                        onFocus={(e) => {
                          const raw = e.target.value.replace(/\D/g, "");
                          e.target.value = raw;
                        }}
                      />
                      {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount.message}</p>}
                    </div>
                    {rawDealPrice > 0 && (
                      <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                        <span className="text-gray-500">Selisih</span>
                        <span className={`font-semibold ${other >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {other >= 0 ? "+" : ""}Rp{other.toLocaleString("id-ID")}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Request Software</label>
                  <input type="text" placeholder="Contoh: Office, Photoshop" className={inputClass} {...register("software_request")} />
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep(1)} className={btnSecondary}>← Kembali</button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedLaptop) { alert("Pilih laptop dulu"); return; }
                      if (!watch("amount")) { alert("Masukkan harga deal"); return; }
                      setStep(3);
                    }}
                    className={btnPrimary}
                  >
                    Lanjut ke Pengambilan →
                  </button>
                </div>
              </>
            )}

            {/* STEP 3 */}
            {step === 3 && (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Metode Pengambilan</label>
                  <select className={selectClass} {...register("pickup_method")}>
                    <option value="DATANG">Datang ke toko</option>
                    <option value="DIANTAR">Diantar</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1.5 block">Tanggal</label>
                    <input type="date" className={inputClass} {...register("pickup_date")} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1.5 block">Jam</label>
                    <input type="time" className={inputClass} {...register("pickup_time")} />
                  </div>
                </div>
                {pickupMethod === "DIANTAR" && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1.5 block">Alamat pengiriman</label>
                    <input type="text" placeholder="Jalan, RT/RW, Kelurahan, Kecamatan, Kota" className={inputClass} {...register("pickup_location")} />
                    {errors.pickup_location && <p className="text-xs text-red-500 mt-1">{errors.pickup_location.message}</p>}
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep(2)} className={btnSecondary}>← Kembali</button>
                  <button type="button" onClick={() => setStep(4)} className={btnPrimary}>Lanjut ke Pembayaran →</button>
                </div>
              </>
            )}

            {/* STEP 4 */}
            {step === 4 && (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Metode Pembayaran</label>
                  <select className={selectClass} {...register("payment_method")}>
                    <option value="CASH">Cash</option>
                    <option value="TRANSFER">Transfer</option>
                    <option value="DP">DP</option>
                    <option value="CICILAN">Cicilan</option>
                    <option value="LAINNYA">Lainnya</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Foto Bukti Pembayaran <span className="text-red-400">*</span></label>
                  <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/30 hover:bg-gray-50 transition">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 transition"
                      onChange={handlePhotoChange}
                    />
                  </div>
                  {paymentPhoto && (
                    <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                      {paymentPhoto.name}
                    </p>
                  )}
                  {errors.payment_photo && <p className="text-xs text-red-500 mt-1">{errors.payment_photo.message}</p>}
                </div>

                <div className="border border-gray-200 rounded-xl p-4 flex justify-between items-center bg-white shadow-sm">
                  <div>
                    <p className="text-sm font-medium text-gray-800">GPS Lokasi</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {latitude ? "Koordinat terekam" : "Belum diambil"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={getLocation}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                      latitude
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-[#1a1a2e] text-white hover:bg-[#16213e] shadow-sm"
                    }`}
                  >
                    {gpsLoading ? (
                      <span className="flex items-center gap-1">
                        <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        ...
                      </span>
                    ) : latitude ? "✓ Diambil" : "Ambil GPS"}
                  </button>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Catatan (opsional)</label>
                  <textarea rows={2} className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20" {...register("notes")} />
                </div>

                <div className="flex gap-3 pt-3">
                  <button type="button" onClick={() => setStep(3)} className={btnSecondary}>← Kembali</button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className={`${btnPrimary} disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                  >
                    {submitting ? (
                      <>
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="3"/><path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        Menyimpan...
                      </>
                    ) : "Simpan Transaksi"}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}