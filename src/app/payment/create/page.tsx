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
        maxSizeMB: 0.3,
        maxWidthOrHeight: 1280,
        useWebWorker: true,
      });

      const result = new File([compressed], file.name, { type: compressed.type });
      setPaymentPhoto(result);
    } catch {
      setPaymentPhoto(file);
    }
  };

  const inputClass =
    "border border-gray-200 rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e] bg-white w-full transition";
  const selectClass =
    "border border-gray-200 rounded-xl h-11 px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e] w-full transition";
  const btnSecondary =
    "flex-1 bg-white text-gray-600 border border-gray-200 rounded-xl h-11 font-medium hover:bg-gray-50 active:scale-[0.98] transition-all text-sm";
  const btnPrimary =
    "flex-1 bg-[#1a1a2e] text-white rounded-xl h-11 font-medium hover:bg-[#16213e] active:scale-[0.98] transition-all text-sm";

  const stepLabels = ["Data Pembeli", "Laptop & Harga", "Pengambilan", "Pembayaran"];

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-lg font-bold text-[#1a1a2e] tracking-tight">Buat Payment</h1>
          <p className="text-gray-400 text-xs mt-0.5">{stepLabels[step - 1]}</p>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1.5 mb-6">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${step > item
                ? "bg-[#1a1a2e]"
                : step === item
                  ? "bg-[#1a1a2e]/50"
                  : "bg-gray-200"
                }`}
            />
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">

          {/* STEP 1 */}
          {step === 1 && (
            <>
              <input type="text" placeholder="Atas Nama *" className={inputClass} {...register("customer_name")} />
              <input type="text" placeholder="Nama Perusahaan" className={inputClass} {...register("company_name")} />
              <input type="tel" placeholder="No. WhatsApp *" className={inputClass} {...register("customer_phone")} />
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Tahu Solit dari mana?</label>
                <select className={selectClass} {...register("source_platform")}>
                  {["Instagram", "TikTok", "Facebook", "WhatsApp", "Google", "Shopee", "Tokopedia", "Teman", "Lainnya"].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!watch("customer_name")) { alert("Isi nama customer dulu"); return; }
                  setStep(2);
                }}
                className={`w-full ${btnPrimary}`}
              >
                Lanjut →
              </button>
            </>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <>
              {isLoadingLaptops ? (
                <div className="h-11 bg-gray-100 rounded-xl animate-pulse" />
              ) : (
                <select className={selectClass} {...register("laptop_id")}>
                  <option value="">Pilih Laptop</option>
                  {laptops.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.laptop_name} — {item.ram}/{item.storage} — Rp{item.selling_price.toLocaleString("id-ID")}
                    </option>
                  ))}
                </select>
              )}
              <input type="hidden" {...register("laptop_name")} />
              <input type="hidden" {...register("serial_number")} />

              {selectedLaptop && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-2.5 border border-gray-100">
                  <div>
                    <p className="font-semibold text-[#1a1a2e] text-sm">{selectedLaptop.laptop_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      SN: {selectedLaptop.serial_number} · {selectedLaptop.cpu} · {selectedLaptop.ram} · {selectedLaptop.storage}
                    </p>
                  </div>
                  <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
                    <span className="text-gray-500">Harga inventory</span>
                    <span className="font-medium text-gray-800">Rp{selectedLaptop.selling_price.toLocaleString("id-ID")}</span>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1.5 block">Harga Deal *</label>
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
                  </div>
                  {rawDealPrice > 0 && (
                    <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
                      <span className="text-gray-500">Selisih</span>
                      <span className={`font-semibold ${other >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {other >= 0 ? "+" : ""}Rp{other.toLocaleString("id-ID")}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <input type="text" placeholder="Request Software" className={inputClass} {...register("software_request")} />

              <div className="flex gap-2 pt-1">
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
                  Lanjut →
                </button>
              </div>
            </>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Metode Pengambilan</label>
                <select className={selectClass} {...register("pickup_method")}>
                  <option value="DATANG">Datang ke toko</option>
                  <option value="DIANTAR">Diantar</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Tanggal</label>
                <input type="date" className={inputClass} {...register("pickup_date")} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Jam</label>
                <input type="time" className={inputClass} {...register("pickup_time")} />
              </div>
              {pickupMethod === "DIANTAR" && (
                <input type="text" placeholder="Alamat pengiriman" className={inputClass} {...register("pickup_location")} />
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setStep(2)} className={btnSecondary}>← Kembali</button>
                <button type="button" onClick={() => setStep(4)} className={btnPrimary}>Lanjut →</button>
              </div>
            </>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Metode Pembayaran</label>
                <select className={selectClass} {...register("payment_method")}>
                  <option value="CASH">Cash</option>
                  <option value="TRANSFER">Transfer</option>
                  <option value="DP">DP</option>
                  <option value="CICILAN">Cicilan</option>
                  <option value="LAINNYA">Lainnya</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Foto Bukti Pembayaran *</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="border border-gray-200 rounded-xl p-3 text-sm w-full bg-white file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 transition"
                  onChange={handlePhotoChange}
                />
                {paymentPhoto && (
                  <p className="text-xs text-emerald-600 mt-1">✓ {paymentPhoto.name}</p>
                )}
              </div>

              <div className="border border-gray-200 rounded-xl p-4 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-800">GPS Lokasi</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {latitude ? `✓ Koordinat berhasil diambil` : "Wajib diambil sebelum simpan"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={getLocation}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition active:scale-95 ${latitude
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-[#1a1a2e] text-white hover:bg-[#16213e]"
                    }`}
                >
                  {gpsLoading ? "..." : latitude ? "✓ Diambil" : "Ambil GPS"}
                </button>
              </div>

              <input type="text" placeholder="Catatan (opsional)" className={inputClass} {...register("notes")} />

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setStep(3)} className={btnSecondary}>← Kembali</button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`${btnPrimary} disabled:opacity-50`}
                >
                  {submitting ? "Menyimpan..." : "Simpan Transaksi"}
                </button>
              </div>
            </>
          )}

        </form>
      </div>
    </div>
  );
}