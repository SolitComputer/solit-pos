"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createPaymentSchema, CreatePaymentType } from "@/lib/validation";
import { supabase } from "@/services/supabase";
import DashboardLayout from "@/components/layout/DashboardLayout";

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

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreatePaymentType>({
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
  const dealPrice = watch("amount");
  const other = selectedLaptop ? (dealPrice || 0) - selectedLaptop.selling_price : 0;

  useEffect(() => {
    if (!selectedLaptop) return;
    setValue("laptop_name", selectedLaptop.laptop_name);
    setValue("serial_number", selectedLaptop.serial_number);
  }, [selectedLaptop, setValue]);

  useEffect(() => {
    const fetchLaptops = async () => {
      setIsLoadingLaptops(true);
      try {
        const response = await fetch("/api/laptops/ready");
        const result = await response.json();
        setLaptops(result.data || []);
      } catch (error) {
        console.error(error);
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
      (position) => {
        setLatitude(String(position.coords.latitude));
        setLongitude(String(position.coords.longitude));
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
    try {
      if (!paymentPhoto) {
        alert("Foto pembayaran wajib diupload");
        return;
      }
      if (!latitude || !longitude) {
        alert("GPS wajib diambil");
        return;
      }

      const fileName = `${Date.now()}-${paymentPhoto.name}`;
      const { error: uploadError } = await supabase.storage
        .from("payment-proof")
        .upload(fileName, paymentPhoto);
      if (uploadError) {
        console.log(uploadError);
        alert("Upload foto gagal");
        return;
      }

      const { data: imageData } = supabase.storage
        .from("payment-proof")
        .getPublicUrl(fileName);

      const response = await fetch("/api/transaction/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          payment_photo: imageData.publicUrl,
          latitude,
          longitude,
        }),
      });
      const result = await response.json();
      if (!result.success) {
        alert(result.message);
        return;
      }
      window.location.href = `/receipt/${result.data.invoice_number}`;
    } catch (error) {
      console.log(error);
      alert("Terjadi kesalahan");
    }
  };

  const inputClass =
    "border border-gray-200 rounded-lg h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 bg-gray-50/50 w-full";
  const selectClass =
    "border border-gray-200 rounded-lg h-10 px-3 text-sm bg-gray-50/50 focus:outline-none focus:ring-1 focus:ring-gray-300 w-full";

  const FormContent = () => (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-800 tracking-tight">Buat Payment</h1>
        <p className="text-gray-500 text-sm mb-4">Isi data pemesanan laptop</p>

        {/* Step Indicator */}
        <div className="flex gap-2 mb-5">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className={`h-1.5 flex-1 rounded-full transition-all ${step >= item ? "bg-gray-700" : "bg-gray-200"}`}
            />
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* STEP 1 */}
          {step === 1 && (
            <>
              <input type="text" placeholder="Atas Nama" className={inputClass} {...register("customer_name")} />
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Perusahaan</label>
                <input type="text" placeholder="Nama perusahaan" className={inputClass} {...register("company_name")} />
                {errors.company_name && <p className="text-red-500 text-xs mt-1">{errors.company_name.message}</p>}
              </div>
              <input type="text" placeholder="WhatsApp" className={inputClass} {...register("customer_phone")} />
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Tahu Solit dari Mana?</label>
                <select className={selectClass} {...register("source_platform")}>
                  <option value="Instagram">Instagram</option>
                  <option value="TikTok">TikTok</option>
                  <option value="Facebook">Facebook</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Google">Google</option>
                  <option value="Shopee">Shopee</option>
                  <option value="Tokopedia">Tokopedia</option>
                  <option value="Teman">Teman</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!watch("customer_name")) {
                    alert("Isi nama customer dulu");
                    return;
                  }
                  setStep(2);
                }}
                className="w-full bg-white text-gray-700 border border-gray-200 rounded-lg h-10 font-medium hover:bg-gray-50 transition shadow-sm"
              >
                Lanjut
              </button>
            </>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <>
              {isLoadingLaptops ? (
                <div className="h-10 bg-gray-100 rounded-lg animate-pulse"></div>
              ) : (
                <select className={selectClass} {...register("laptop_id")}>
                  <option value="">Pilih Laptop</option>
                  {laptops.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.laptop_name} | {item.cpu} | {item.ram} | {item.storage} | Rp{item.selling_price.toLocaleString("id-ID")}
                    </option>
                  ))}
                </select>
              )}
              <input type="hidden" {...register("laptop_name")} />
              <input type="hidden" {...register("serial_number")} />

              {selectedLaptop && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3 border border-gray-100">
                  <div>
                    <p className="font-semibold text-gray-800">{selectedLaptop.laptop_name}</p>
                    <p className="text-xs text-gray-500">SN: {selectedLaptop.serial_number}</p>
                    <p className="text-xs text-gray-500">
                      {selectedLaptop.cpu} | {selectedLaptop.ram} | {selectedLaptop.storage}
                    </p>
                  </div>
                  <div className="border-t border-gray-200 pt-2 flex justify-between text-sm">
                    <span className="text-gray-600">Harga Inventory</span>
                    <span className="font-medium text-gray-800">Rp{selectedLaptop.selling_price.toLocaleString("id-ID")}</span>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Harga Deal</label>
                    <input type="number" placeholder="Masukkan harga deal" className={inputClass} {...register("amount", { valueAsNumber: true })} />
                  </div>
                  <div className="border-t border-gray-200 pt-2 flex justify-between text-sm">
                    <span className="text-gray-600">Other</span>
                    <span className={`font-medium ${other >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {other >= 0 ? "+" : "-"} Rp{Math.abs(other).toLocaleString("id-ID")}
                    </span>
                  </div>
                </div>
              )}

              <input type="text" placeholder="Request Software" className={inputClass} {...register("software_request")} />

              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(1)} className="flex-1 bg-white text-gray-700 border border-gray-200 rounded-lg h-10 font-medium hover:bg-gray-50 transition">
                  Kembali
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedLaptop) {
                      alert("Pilih laptop dulu");
                      return;
                    }
                    if (!watch("amount")) {
                      alert("Masukkan harga deal");
                      return;
                    }
                    setStep(3);
                  }}
                  className="flex-1 bg-white text-gray-700 border border-gray-200 rounded-lg h-10 font-medium hover:bg-gray-50 transition"
                >
                  Lanjut
                </button>
              </div>
            </>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <>
              <select className={selectClass} {...register("pickup_method")}>
                <option value="DATANG">Datang ke toko</option>
                <option value="DIANTAR">Diantar</option>
              </select>
              <input type="date" className={inputClass} {...register("pickup_date")} />
              <input type="time" className={inputClass} {...register("pickup_time")} />
              {pickupMethod === "DIANTAR" && (
                <input type="text" placeholder="Lokasi Antar" className={inputClass} {...register("pickup_location")} />
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(2)} className="flex-1 bg-white text-gray-700 border border-gray-200 rounded-lg h-10 font-medium hover:bg-gray-50 transition">
                  Kembali
                </button>
                <button type="button" onClick={() => setStep(4)} className="flex-1 bg-white text-gray-700 border border-gray-200 rounded-lg h-10 font-medium hover:bg-gray-50 transition">
                  Lanjut
                </button>
              </div>
            </>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <>
              <select className={selectClass} {...register("payment_method")}>
                <option value="CASH">Cash</option>
                <option value="TRANSFER">Transfer</option>
                <option value="DP">DP</option>
                <option value="CICILAN">Cicilan</option>
                <option value="LAINNYA">Lainnya</option>
              </select>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Foto Bukti Pembayaran</label>
                <input
                  type="file"
                  accept="image/*"
                  className="border border-gray-200 rounded-lg p-2 text-sm w-full bg-gray-50/50 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                  onChange={(e) => setPaymentPhoto(e.target.files?.[0] || null)}
                />
                <p className="text-xs text-gray-400 mt-1">Wajib upload foto uang / transfer</p>
              </div>

              <div className="border border-gray-100 rounded-lg p-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-800">GPS Lokasi</p>
                  <p className="text-xs text-gray-500">{latitude ? "GPS berhasil diambil" : "GPS wajib aktif"}</p>
                </div>
                <button
                  type="button"
                  onClick={getLocation}
                  className="bg-white text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-50 transition"
                >
                  {gpsLoading ? "Loading..." : latitude ? "Diambil" : "Ambil GPS"}
                </button>
              </div>

              <input type="text" placeholder="Catatan" className={inputClass} {...register("notes")} />

              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(3)} className="flex-1 bg-white text-gray-700 border border-gray-200 rounded-lg h-10 font-medium hover:bg-gray-50 transition">
                  Kembali
                </button>
                <button type="submit" className="flex-1 bg-white text-gray-700 border border-gray-200 rounded-lg h-10 font-medium hover:bg-gray-50 transition shadow-sm">
                  Simpan Transaksi
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );

  // Bungkus dengan DashboardLayout agar ada sidebar dan logout
  return (
    <DashboardLayout>
      <FormContent />
    </DashboardLayout>
  );
}