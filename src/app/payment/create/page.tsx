"use client";

import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createPaymentSchema, CreatePaymentType } from "@/lib/validation";
import { supabase } from "@/services/supabase";
import imageCompression from "browser-image-compression";
import { useSearchParams } from "next/navigation";
import { UseFormSetValue } from "react-hook-form";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LaptopOption {
  id: string;
  laptop_name: string;
  brand: string;
  cpu: string;
  ram: string;
  storage: string;
  selling_price: number;
  qty: number;
}

interface UnitOption {
  id: string;
  serial_number: string;
  grade: "A" | "B" | "C";
  selling_price: number;
  condition_note: string;
  status: string;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CreatePaymentPage() {
  const searchParams = useSearchParams();
  const urlUnitId = searchParams.get("unit_id") || "";
  const urlLaptopId = searchParams.get("laptop_id") || "";
  const urlSn = searchParams.get("sn") || "";

  // Jika datang dari scan barcode, mulai dari step 1 (data pembeli)
  // tapi unit sudah pre-selected → step 2 akan di-skip
  const fromScan = Boolean(urlUnitId && urlSn);

  const [step, setStep] = useState(1);
  const [paymentPhoto, setPaymentPhoto] = useState<File | null>(null);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Laptop list
  const [laptops, setLaptops] = useState<LaptopOption[]>([]);
  const [isLoadingLaptops, setIsLoadingLaptops] = useState(true);

  // Units untuk laptop yang dipilih
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [isLoadingUnits, setIsLoadingUnits] = useState(false);

  // Selected state
  const [selectedLaptop, setSelectedLaptop] = useState<LaptopOption | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<UnitOption | null>(null);

  const [rawDealPrice, setRawDealPrice] = useState<number>(0);

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
  const other = selectedUnit
    ? rawDealPrice - (selectedUnit.selling_price || selectedLaptop?.selling_price || 0)
    : 0;

  // ── Fetch laptops yang ready ──────────────────────────────────────────────
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

  // ── Jika dari scan: pre-load unit langsung ────────────────────────────────
  useEffect(() => {
    if (!fromScan || !urlUnitId) return;
    const loadUnitFromScan = async () => {
      try {
        const res = await fetch(`/api/units/check-sn?sn=${encodeURIComponent(urlSn)}`);
        const result = await res.json();
        if (!result.success) return;

        const unit = result.data;
        const laptop = unit.laptop;

        // Set laptop
        setSelectedLaptop({
          id: laptop.id,
          laptop_name: laptop.laptop_name,
          brand: laptop.brand,
          cpu: laptop.cpu,
          ram: laptop.ram,
          storage: laptop.storage,
          selling_price: unit.selling_price,
          qty: 1,
        });

        // Set unit
        setSelectedUnit({
          id: unit.id,
          serial_number: unit.serial_number,
          grade: unit.grade,
          selling_price: unit.selling_price,
          condition_note: unit.condition_note,
          status: unit.status,
        });

        // Pre-fill hidden fields
        setValue("laptop_name", laptop.laptop_name);
        setValue("serial_number", unit.serial_number);
        setValue("laptop_id", laptop.id);
        setValue("unit_id", unit.id);
      } catch { /* ignore */ }
    };
    loadUnitFromScan();
  }, [fromScan, urlUnitId, urlSn, setValue]);

  // ── Fetch units saat laptop dipilih manual ────────────────────────────────
  const fetchUnitsForLaptop = useCallback(async (laptopId: string) => {
    if (!laptopId) { setUnits([]); setSelectedUnit(null); return; }
    setIsLoadingUnits(true);
    try {
      const res = await fetch(`/api/laptops/${laptopId}/units`);
      const result = await res.json();
      // Hanya tampilkan yang SIAP_JUAL
      const siap: UnitOption[] = (result.data || []).filter(
        (u: UnitOption) => u.status === "SIAP_JUAL"
      );
      setUnits(siap);
      // Auto-select jika hanya 1 unit
      if (siap.length === 1) {
        setSelectedUnit(siap[0]);
        setValue("serial_number", siap[0].serial_number);
        setValue("unit_id", siap[0].id);
      } else {
        setSelectedUnit(null);
      }
    } catch {
      setUnits([]);
    } finally {
      setIsLoadingUnits(false);
    }
  }, [setValue]);

  // ── Handler pilih laptop ──────────────────────────────────────────────────
  const handleLaptopChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const laptop = laptops.find(l => l.id === id) || null;
    setSelectedLaptop(laptop);
    setSelectedUnit(null);
    setValue("laptop_id", id);
    setValue("laptop_name", laptop?.laptop_name || "");
    setValue("unit_id", "");
    setValue("serial_number", "");
    if (id) fetchUnitsForLaptop(id);
    else setUnits([]);
  };

  // ── Handler pilih unit (SN) ───────────────────────────────────────────────
  const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const unit = units.find(u => u.id === id) || null;
    setSelectedUnit(unit);
    setValue("unit_id", id);
    setValue("serial_number", unit?.serial_number || "");
  };

  // ── GPS ───────────────────────────────────────────────────────────────────
  const getLocation = () => {
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(String(pos.coords.latitude));
        setLongitude(String(pos.coords.longitude));
        setGpsLoading(false);
      },
      () => { alert("GPS wajib diaktifkan"); setGpsLoading(false); },
      { enableHighAccuracy: true }
    );
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const onSubmit = async (data: CreatePaymentType) => {
    if (!paymentPhoto) { alert("Foto pembayaran wajib diupload"); return; }
    if (!latitude || !longitude) { alert("GPS wajib diambil"); return; }
    if (!selectedUnit) { alert("Pilih unit / serial number dulu"); return; }

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
          unit_id: selectedUnit.id,
          laptop_id: selectedLaptop?.id,
          serial_number: selectedUnit.serial_number,
          laptop_name: selectedLaptop?.laptop_name,
          payment_photo: imageData.publicUrl,
          latitude,
          longitude,
          amount: rawDealPrice,
        }),
      });
      const result = await res.json();
      if (!result.success) { alert(result.message); return; }
      window.location.href = `/receipt/${result.invoice_number}`;
    } catch {
      alert("Terjadi kesalahan");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Photo compress ────────────────────────────────────────────────────────
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.1, maxWidthOrHeight: 800,
        useWebWorker: true, initialQuality: 0.7,
      });
      setPaymentPhoto(new File([compressed], file.name, { type: compressed.type }));
    } catch {
      setPaymentPhoto(file);
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const inputClass = "border border-gray-200 rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e] bg-white w-full transition";
  const selectClass = "border border-gray-200 rounded-xl h-11 px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e] w-full transition";
  const btnSecondary = "flex-1 bg-white text-gray-600 border border-gray-200 rounded-xl h-11 font-medium hover:bg-gray-50 active:scale-[0.98] transition-all text-sm";
  const btnPrimary = "flex-1 bg-[#1a1a2e] text-white rounded-xl h-11 font-medium hover:bg-[#16213e] active:scale-[0.98] transition-all text-sm";

  const stepLabels = ["Data Pembeli", "Laptop & Unit", "Pengambilan", "Pembayaran"];

  // Step 2 di-skip jika dari scan (unit sudah pre-selected)
  const goToStep3 = () => setStep(3);
  const backFromStep3 = () => fromScan ? setStep(1) : setStep(2);

  // ─────────────────────────────────────────────────────────────────────────
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
            <div key={item} className={`h-1 flex-1 rounded-full transition-all duration-300 ${step > item ? "bg-[#1a1a2e]"
                : step === item ? "bg-[#1a1a2e]/50"
                  : "bg-gray-200"
              }`} />
          ))}
        </div>

        {/* Banner scan */}
        {fromScan && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 mb-4">
            <svg className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-xs font-semibold text-emerald-700">Unit dari scan barcode</p>
              <p className="text-xs text-emerald-600 font-mono">{urlSn}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {/* Hidden fields */}
          <input type="hidden" {...register("laptop_id")} />
          <input type="hidden" {...register("laptop_name")} />
          <input type="hidden" {...register("serial_number")} />
          <input type="hidden" {...register("unit_id" as any)} />

          {/* ── STEP 1: Data Pembeli ── */}
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
                  if (!watch("customer_phone")) { alert("Isi nomor WhatsApp dulu"); return; }
                  // Dari scan → langsung ke step 3 (unit sudah ada)
                  fromScan ? setStep(3) : setStep(2);
                }}
                className={`w-full ${btnPrimary}`}
              >
                Lanjut →
              </button>
            </>
          )}

          {/* ── STEP 2: Pilih Laptop + Unit (SN) ── */}
          {/* Step ini hanya muncul jika BUKAN dari scan barcode */}
          {step === 2 && !fromScan && (
            <>
              {/* Pilih Laptop */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Pilih Laptop</label>
                {isLoadingLaptops ? (
                  <div className="h-11 bg-gray-100 rounded-xl animate-pulse" />
                ) : (
                  <select
                    className={selectClass}
                    value={selectedLaptop?.id || ""}
                    onChange={handleLaptopChange}
                  >
                    <option value="">— Pilih Laptop —</option>
                    {laptops.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.laptop_name}
                        {item.brand ? ` (${item.brand})` : ""}
                        {" — "}
                        {item.qty} unit tersedia
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Pilih Unit / SN — muncul setelah laptop dipilih */}
              {selectedLaptop && (
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">
                    Pilih Unit (Serial Number)
                  </label>
                  {isLoadingUnits ? (
                    <div className="h-11 bg-gray-100 rounded-xl animate-pulse" />
                  ) : units.length === 0 ? (
                    <div className="h-11 border border-red-200 bg-red-50 rounded-xl flex items-center px-4">
                      <span className="text-sm text-red-500">Tidak ada unit SIAP_JUAL</span>
                    </div>
                  ) : (
                    <select
                      className={selectClass}
                      value={selectedUnit?.id || ""}
                      onChange={handleUnitChange}
                    >
                      <option value="">— Pilih Serial Number —</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          SN: {u.serial_number} · Grade {u.grade}
                          {u.selling_price
                            ? ` · Rp${u.selling_price.toLocaleString("id-ID")}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Info card unit yang dipilih */}
              {selectedLaptop && selectedUnit && (
                <UnitInfoCard
                  laptop={selectedLaptop}
                  unit={selectedUnit}
                  rawDealPrice={rawDealPrice}
                  setRawDealPrice={setRawDealPrice}
                  setValue={setValue}
                  other={other}
                  inputClass={inputClass}
                />
              )}

              <input
                type="text"
                placeholder="Request Software (opsional)"
                className={inputClass}
                {...register("software_request")}
              />

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setStep(1)} className={btnSecondary}>← Kembali</button>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedLaptop) { alert("Pilih laptop dulu"); return; }
                    if (!selectedUnit) { alert("Pilih serial number unit dulu"); return; }
                    if (!rawDealPrice) { alert("Masukkan harga deal"); return; }
                    setStep(3);
                  }}
                  className={btnPrimary}
                >
                  Lanjut →
                </button>
              </div>
            </>
          )}

          {/* Step 2 dari scan: tampilkan info unit yang sudah pre-selected */}
          {step === 2 && fromScan && (
            // Ini tidak akan pernah muncul karena fromScan skip step 2
            null
          )}

          {/* ── STEP 3: Pengambilan ── */}
          {step === 3 && (
            <>
              {/* Ringkasan unit jika dari scan */}
              {fromScan && selectedLaptop && selectedUnit && (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2 mb-1">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Unit Terpilih</p>
                  <p className="font-semibold text-[#1a1a2e] text-sm">{selectedLaptop.laptop_name}</p>
                  <p className="text-xs text-gray-500 font-mono">SN: {selectedUnit.serial_number} · Grade {selectedUnit.grade}</p>
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
                    {rawDealPrice > 0 && (
                      <div className="flex justify-between text-sm mt-2">
                        <span className="text-gray-500">Selisih</span>
                        <span className={`font-semibold ${other >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {other >= 0 ? "+" : ""}Rp{other.toLocaleString("id-ID")}
                        </span>
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Request Software (opsional)"
                    className={inputClass}
                    {...register("software_request")}
                  />
                </div>
              )}

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
                <button type="button" onClick={backFromStep3} className={btnSecondary}>← Kembali</button>
                <button
                  type="button"
                  onClick={() => {
                    if (fromScan && !rawDealPrice) { alert("Masukkan harga deal dulu"); return; }
                    setStep(4);
                  }}
                  className={btnPrimary}
                >
                  Lanjut →
                </button>
              </div>
            </>
          )}

          {/* ── STEP 4: Pembayaran ── */}
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
                  type="file" accept="image/*" capture="environment"
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
                    {latitude ? "✓ Koordinat berhasil diambil" : "Wajib diambil sebelum simpan"}
                  </p>
                </div>
                <button
                  type="button" onClick={getLocation}
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
                  type="submit" disabled={submitting}
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

// ─── Unit Info Card (dipakai di step 2 manual) ────────────────────────────────
function UnitInfoCard({
  laptop,
  unit,
  rawDealPrice,
  setRawDealPrice,
  setValue,
  other,
  inputClass,
}: {
  laptop: LaptopOption;
  unit: UnitOption;
  rawDealPrice: number;
  setRawDealPrice: (n: number) => void;
  setValue: UseFormSetValue<CreatePaymentType>;
  other: number;
  inputClass: string;
}) {
  const gradeColor = {
    A: "text-emerald-700 bg-emerald-50 border-emerald-200",
    B: "text-amber-700 bg-amber-50 border-amber-200",
    C: "text-red-700 bg-red-50 border-red-200",
  };

  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
      {/* Laptop name + specs */}
      <div>
        <p className="font-semibold text-[#1a1a2e] text-sm">{laptop.laptop_name}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {[laptop.cpu, laptop.ram, laptop.storage].filter(Boolean).join(" · ")}
        </p>
      </div>

      {/* SN + Grade */}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
        <div className="flex-1">
          <p className="text-xs text-gray-400 mb-0.5">Serial Number</p>
          <p className="font-mono text-sm font-semibold text-[#1a1a2e]">{unit.serial_number}</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${gradeColor[unit.grade] || gradeColor.A}`}>
          Grade {unit.grade}
        </span>
      </div>

      {/* Kondisi */}
      {unit.condition_note && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {unit.condition_note}
        </p>
      )}

      {/* Harga inventory */}
      <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
        <span className="text-gray-500">Harga inventory</span>
        <span className="font-medium text-gray-800">
          Rp{(unit.selling_price || laptop.selling_price || 0).toLocaleString("id-ID")}
        </span>
      </div>

      {/* Harga Deal input */}
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

      {/* Selisih */}
      {rawDealPrice > 0 && (
        <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
          <span className="text-gray-500">Selisih</span>
          <span className={`font-semibold ${other >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {other >= 0 ? "+" : ""}Rp{other.toLocaleString("id-ID")}
          </span>
        </div>
      )}
    </div>
  );
}