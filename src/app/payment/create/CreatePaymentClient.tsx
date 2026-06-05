"use client";

import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createPaymentSchema, CreatePaymentType } from "@/lib/validation";
import { supabase } from "@/services/supabase";
import imageCompression from "browser-image-compression";
import { useSearchParams } from "next/navigation";
import { UseFormSetValue } from "react-hook-form";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";

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

const DRAFT_KEY = "payment_draft_v1";

function saveDraft(data: object) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

function loadDraft(): Record<string, any> | null {
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

export default function CreatePaymentPage() {
    const searchParams = useSearchParams();
    const urlUnitId = searchParams.get("unit_id") || "";
    const urlLaptopId = searchParams.get("laptop_id") || "";
    const urlSn = searchParams.get("sn") || "";

    const fromScan = Boolean(urlUnitId && urlSn);

    const [step, setStep] = useState(1);
    const [paymentPhoto, setPaymentPhoto] = useState<File | null>(null);
    const [latitude, setLatitude] = useState("");
    const [longitude, setLongitude] = useState("");
    const [gpsLoading, setGpsLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [warrantyDuration, setWarrantyDuration] = useState<number>(30);

    // Laptop list
    const [laptops, setLaptops] = useState<LaptopOption[]>([]);
    const [isLoadingLaptops, setIsLoadingLaptops] = useState(true);

    const [units, setUnits] = useState<UnitOption[]>([]);
    const [isLoadingUnits, setIsLoadingUnits] = useState(false);

    // Selected state
    const [selectedLaptop, setSelectedLaptop] = useState<LaptopOption | null>(null);
    const [selectedUnit, setSelectedUnit] = useState<UnitOption | null>(null);
    const [snSearch, setSnSearch] = useState("");
    const [snResults, setSnResults] = useState<(UnitOption & { laptop_name: string; laptop_id: string })[]>([]);

    const [rawDealPrice, setRawDealPrice] = useState<number>(0);
    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const [draftRestored, setDraftRestored] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [pendingSubmitData, setPendingSubmitData] = useState<CreatePaymentType | null>(null);

    const [customerType, setCustomerType] = useState<"UMUM" | "RESELLER" | "MITRA">("UMUM");

    const [isEcommerce, setIsEcommerce] = useState(false);
    const [ecommercePlatform, setEcommercePlatform] = useState<"SHOPEE" | "TOKOPEDIA" | "TIKTOK" | "LAZADA" | "">("");
    const [ecommerceOrderId, setEcommerceOrderId] = useState("");
    const [isSubmitted, setIsSubmitted] = useState(false);

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        formState: { errors }
    } = useForm<CreatePaymentType>({
        resolver: zodResolver(createPaymentSchema),
        defaultValues: {
            company_name: "Solit 03",
            payment_method: "CASH" as const,
            pickup_method: "DATANG",
            source_platform: "Instagram",
            customer_type: "UMUM" as const,
            customer_name: "",
            customer_phone: "",
            laptop_id: "",
            laptop_name: "",
            unit_id: "",
            serial_number: "",
            pickup_date: "",
            pickup_time: "",
            amount: 0,
        } as CreatePaymentType,
    });

    const pickupMethod = watch("pickup_method");
    const other = selectedUnit
        ? rawDealPrice - (selectedUnit.selling_price || selectedLaptop?.selling_price || 0)
        : 0;

    // ✅ Watch customer_type dari form
    const watchedCustomerType = watch("customer_type");

    // Update local state when form value changes
    useEffect(() => {
        if (watchedCustomerType && (watchedCustomerType === "UMUM" || watchedCustomerType === "RESELLER" || watchedCustomerType === "MITRA")) {
            setCustomerType(watchedCustomerType);
        }
    }, [watchedCustomerType]);

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

    useEffect(() => {
        fetch("/api/auth/me")
            .then(r => r.json())
            .then(r => setUserRole(r.user?.role ?? null))
            .catch(() => setUserRole(null));
    }, []);

    // ── Restore draft dari localStorage ──────────────────────────────────────────
    useEffect(() => {
        if (fromScan) return;

        const draft = loadDraft();
        if (!draft) return;

        const fields = [
            "customer_name", "customer_phone", "company_name",
            "source_platform", "pickup_method", "pickup_date",
            "pickup_time", "pickup_location", "payment_method",
            "software_request", "notes", "amount", "customer_type", // ✅ tambah customer_type
        ] as const;

        fields.forEach(field => {
            if (draft[field] !== undefined) {
                setValue(field as any, draft[field]);
            }
        });

        if (draft._step) setStep(draft._step);
        if (draft._customerType) setCustomerType(draft._customerType);

        if (draft._selectedLaptop) setSelectedLaptop(draft._selectedLaptop);
        if (draft._selectedUnit) {
            const validateUnit = async () => {
                try {
                    const res = await fetch(
                        `/api/units/search-sn?q=${encodeURIComponent(draft._selectedUnit.serial_number)}`
                    );
                    const result = await res.json();
                    const stillValid = (result.data || []).find(
                        (u: any) => u.id === draft._selectedUnit.id && u.status === "SIAP_JUAL"
                    );
                    if (stillValid) {
                        setSelectedUnit(draft._selectedUnit);
                        setSnSearch(draft._selectedUnit.serial_number || "");
                    } else {
                        console.warn("Unit dari draft sudah tidak SIAP_JUAL, di-reset");
                    }
                } catch {
                }
            };
            validateUnit();
        }
        if (draft._rawDealPrice) setRawDealPrice(draft._rawDealPrice);

        setDraftRestored(true);
    }, []);

    const watchedFields = watch();
    useEffect(() => {
        if (fromScan || isSubmitted) return;

        const draft = {
            ...watchedFields,
            _step: step,
            _customerType: customerType,
            _selectedLaptop: selectedLaptop,
            _selectedUnit: selectedUnit,
            _rawDealPrice: rawDealPrice,
            _savedAt: new Date().toISOString(),
        };
        saveDraft(draft);
    }, [watchedFields, step, customerType, selectedLaptop, selectedUnit, rawDealPrice, isSubmitted]);

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

                setSelectedUnit({
                    id: unit.id,
                    serial_number: unit.serial_number,
                    grade: unit.grade,
                    selling_price: unit.selling_price,
                    condition_note: unit.condition_note,
                    status: unit.status,
                });

                setValue("laptop_name", laptop.laptop_name);
                setValue("serial_number", unit.serial_number);
                setValue("laptop_id", laptop.id);
                setValue("unit_id", unit.id);
            } catch { /* ignore */ }
        };
        loadUnitFromScan();
    }, [fromScan, urlUnitId, urlSn, setValue]);

    const canSeeMargin = userRole
        ? hasPermission(userRole, ["ADMIN", "KEPALA_SALES", "ACCOUNTING", "PENGELOLA_BARANG"])
        : false;

    const fetchUnitsForLaptop = useCallback(async (laptopId: string) => {
        if (!laptopId) { setUnits([]); setSelectedUnit(null); return; }
        setIsLoadingUnits(true);
        try {
            const res = await fetch(`/api/laptops/${laptopId}/units`);
            const result = await res.json();
            const siap: UnitOption[] = (result.data || []).filter(
                (u: UnitOption) => u.status === "SIAP_JUAL"
            );
            setUnits(siap);
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

    const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        const unit = units.find(u => u.id === id) || null;
        setSelectedUnit(unit);
        setValue("unit_id", id);
        setValue("serial_number", unit?.serial_number || "");
    };

    const handleSnSearch = useCallback(async (query: string) => {
        if (query.length < 2) { setSnResults([]); return; }
        setIsLoadingUnits(true);
        try {
            const res = await fetch(`/api/units/search-sn?q=${encodeURIComponent(query)}`);
            const result = await res.json();
            setSnResults(result.data || []);
        } catch {
            setSnResults([]);
        } finally {
            setIsLoadingUnits(false);
        }
    }, []);

    const handleSelectSnResult = (u: UnitOption & { laptop_name: string; laptop_id: string }) => {
        setSelectedUnit(u);
        setSelectedLaptop({
            id: u.laptop_id,
            laptop_name: u.laptop_name,
            brand: "",
            cpu: "",
            ram: "",
            storage: "",
            selling_price: u.selling_price,
            qty: 1,
        });
        setValue("unit_id", u.id);
        setValue("serial_number", u.serial_number);
        setValue("laptop_id", u.laptop_id);
        setValue("laptop_name", u.laptop_name);
        setSnResults([]);
    };

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

    const onSubmit = async (data: CreatePaymentType) => {
        if (!paymentPhoto) { alert("Foto pembayaran wajib diupload"); return; }
        if (!latitude || !longitude) { alert("GPS wajib diambil"); return; }
        if (!selectedUnit) { alert("Pilih unit / serial number dulu"); return; }

        // Re-validasi unit masih SIAP_JUAL
        const checkRes = await fetch(
            `/api/units/search-sn?q=${encodeURIComponent(selectedUnit.serial_number)}`
        );
        const checkResult = await checkRes.json();
        const stillAvailable = (checkResult.data || []).find(
            (u: any) => u.id === selectedUnit.id
        );
        if (!stillAvailable) {
            alert(`Unit SN: ${selectedUnit.serial_number} sudah tidak tersedia.\n\nSilakan pilih unit lain.`);
            setSelectedUnit(null);
            setSelectedLaptop(null);
            setSnSearch("");
            setValue("unit_id", "");
            setValue("serial_number", "");
            setValue("laptop_id", "");
            setValue("laptop_name", "");
            setStep(2);
            return;
        }

        setPendingSubmitData(data);
        setShowConfirmModal(true);
    };

    const handleConfirmedSubmit = async () => {
        if (!pendingSubmitData || !selectedUnit || !paymentPhoto) return;

        setShowConfirmModal(false);
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
                    ...pendingSubmitData,
                    customer_type: customerType,
                    unit_id: selectedUnit.id,
                    laptop_id: selectedLaptop?.id,
                    serial_number: selectedUnit.serial_number,
                    laptop_name: selectedLaptop?.laptop_name,
                    payment_photo: imageData.publicUrl,
                    latitude,
                    longitude,
                    amount: rawDealPrice,
                    warranty_duration: warrantyDuration,
                    is_ecommerce: isEcommerce,
                    ecommerce_platform: isEcommerce ? ecommercePlatform : null,
                    ecommerce_order_id: isEcommerce ? ecommerceOrderId : null,
                }),
            });
            const result = await res.json();
            if (!result.success) { alert(result.message); return; }

            setIsSubmitted(true);
            clearDraft();

            window.location.href = `/receipt/${result.invoice_number}`;
        } catch {
            alert("Terjadi kesalahan");
        } finally {
            setSubmitting(false);
            setPendingSubmitData(null);
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

    const goToStep3 = () => setStep(3);
    const backFromStep3 = () => fromScan ? setStep(1) : setStep(2);

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

                {draftRestored && !fromScan && (
                    <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 mb-4">
                        <div className="flex items-center gap-2">
                            <svg className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <p className="text-xs font-semibold text-blue-700">Draft tersimpan dipulihkan</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                clearDraft();
                                window.location.reload();
                            }}
                            className="text-xs text-blue-500 hover:text-blue-700 transition underline"
                        >
                            Mulai baru
                        </button>
                    </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
                    {/* Hidden fields */}
                    <input type="hidden" {...register("laptop_id")} />
                    <input type="hidden" {...register("laptop_name")} />
                    <input type="hidden" {...register("serial_number")} />
                    <input type="hidden" {...register("unit_id" as any)} />
                    <input type="hidden" {...register("customer_type")} />

                    {/* ── STEP 1: Data Pembeli ── */}
                    {step === 1 && (
                        <>
                            <input type="text" placeholder="Atas Nama *" className={inputClass} {...register("customer_name")} />

                            {/* ✅ TAMBAHKAN: Pilihan Tipe Customer */}
                            <div>
                                <label className="text-xs text-gray-400 mb-1.5 block">Tipe Customer *</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { value: "UMUM", label: "Umum", icon: "👤", color: "bg-gray-50", description: "Pembeli biasa" },
                                        { value: "RESELLER", label: "Reseller", icon: "🔄", color: "bg-blue-50", description: "Membeli untuk dijual kembali" },
                                        { value: "MITRA", label: "Mitra", icon: "🤝", color: "bg-green-50", description: "Mitra bisnis Solit 03" }
                                    ].map(option => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => {
                                                setCustomerType(option.value as any);
                                                setValue("customer_type", option.value as any);
                                            }}
                                            className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${customerType === option.value
                                                ? "border-[#1a1a2e] bg-[#1a1a2e]/5 ring-2 ring-[#1a1a2e]/20"
                                                : "border-gray-200 bg-white hover:border-gray-300"
                                                }`}
                                        >
                                            <span className="text-xl">{option.icon}</span>
                                            <span className={`text-xs font-medium ${customerType === option.value
                                                ? "text-[#1a1a2e]"
                                                : "text-gray-600"
                                                }`}>
                                                {option.label}
                                            </span>
                                            <span className="text-[9px] text-gray-400">{option.description}</span>
                                        </button>
                                    ))}
                                </div>
                                {errors.customer_type && (
                                    <p className="text-xs text-red-500 mt-1">{errors.customer_type.message}</p>
                                )}
                            </div>

                            <input type="text" placeholder="Nama Perusahaan" className={inputClass} {...register("company_name")} />
                            <input type="tel" placeholder="No. WhatsApp *" className={inputClass} {...register("customer_phone")} />

                            <div>
                                <label className="text-xs text-gray-400 mb-1.5 block">Tahu Solit dari mana?</label>
                                <select className={selectClass} {...register("source_platform")}>
                                    {["Instagram", "TikTok", "Facebook", "WhatsApp", "Google", "Shopee", "Tokopedia", "Teman", "Lainnya"].map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                                {errors.source_platform && <p className="text-xs text-red-500 mt-1">{errors.source_platform.message}</p>}
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    if (!watch("customer_name")) { alert("Isi nama customer dulu"); return; }
                                    if (!watch("customer_phone")) { alert("Isi nomor WhatsApp dulu"); return; }
                                    fromScan ? setStep(3) : setStep(2);
                                }}
                                className={`w-full ${btnPrimary}`}
                            >
                                Lanjut →
                            </button>
                        </>
                    )}

                    {/* ── STEP 2: Cari via SN langsung ── */}
                    {step === 2 && !fromScan && (
                        <>
                            {/* Search SN */}
                            <div>
                                <label className="text-xs text-gray-400 mb-1.5 block">
                                    Cari Serial Number (SN)
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Ketik SN unit..."
                                        className={inputClass}
                                        value={snSearch}
                                        onChange={(e) => {
                                            setSnSearch(e.target.value);
                                            handleSnSearch(e.target.value);
                                        }}
                                    />
                                    {isLoadingUnits && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            <div className="w-4 h-4 border-2 border-gray-300 border-t-[#1a1a2e] rounded-full animate-spin" />
                                        </div>
                                    )}
                                </div>

                                {/* Dropdown hasil search */}
                                {snResults.length > 0 && !selectedUnit && (
                                    <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
                                        {snResults.map((u) => (
                                            <button
                                                key={u.id}
                                                type="button"
                                                onClick={() => handleSelectSnResult(u)}
                                                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition border-b border-gray-100 last:border-0"
                                            >
                                                <p className="font-mono text-sm font-semibold text-[#1a1a2e]">
                                                    {u.serial_number}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {u.laptop_name} · Grade {u.grade}
                                                    {u.selling_price
                                                        ? ` · Rp${u.selling_price.toLocaleString("id-ID")}`
                                                        : ""}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Tidak ditemukan */}
                                {snSearch.length >= 2 && snResults.length === 0 && !isLoadingUnits && !selectedUnit && (
                                    <p className="text-xs text-red-500 mt-1.5 px-1">
                                        SN tidak ditemukan atau unit tidak SIAP_JUAL
                                    </p>
                                )}
                            </div>

                            {/* Info card unit yang dipilih */}
                            {selectedLaptop && selectedUnit && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedUnit(null);
                                            setSelectedLaptop(null);
                                            setSnSearch("");
                                            setSnResults([]);
                                            setValue("unit_id", "");
                                            setValue("serial_number", "");
                                            setValue("laptop_id", "");
                                            setValue("laptop_name", "");
                                        }}
                                        className="text-xs text-red-400 hover:text-red-500 transition flex items-center gap-1"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                        Ganti unit
                                    </button>
                                    <UnitInfoCard
                                        laptop={selectedLaptop}
                                        unit={selectedUnit}
                                        rawDealPrice={rawDealPrice}
                                        setRawDealPrice={setRawDealPrice}
                                        setValue={setValue}
                                        other={other}
                                        inputClass={inputClass}
                                        canSeeMargin={canSeeMargin}
                                    />
                                </>
                            )}

                            <input
                                type="text"
                                placeholder="Request Software (opsional)"
                                className={inputClass}
                                {...register("software_request")}
                            />

                            <div className="flex gap-2 pt-1">
                                <button type="button" onClick={() => setStep(1)} className={btnSecondary}>
                                    ← Kembali
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!selectedUnit) { alert("Cari dan pilih SN unit dulu"); return; }
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
                                        {rawDealPrice > 0 && canSeeMargin && (
                                            <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
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
                                {errors.pickup_method && <p className="text-xs text-red-500 mt-1">{errors.pickup_method.message}</p>}
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 mb-1.5 block">Tanggal</label>
                                <input type="date" className={inputClass} {...register("pickup_date")} />
                                {errors.pickup_date && <p className="text-xs text-red-500 mt-1">{errors.pickup_date.message}</p>}
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 mb-1.5 block">Jam</label>
                                <input type="time" className={inputClass} {...register("pickup_time")} />
                                {errors.pickup_time && <p className="text-xs text-red-500 mt-1">{errors.pickup_time.message}</p>}
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
                                <label className="text-xs text-gray-400 mb-1.5 block">Jenis Penjualan</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => { setIsEcommerce(false); setEcommercePlatform(""); }}
                                        className={`flex items-center justify-center gap-2 h-11 rounded-xl border text-sm font-medium transition ${!isEcommerce
                                            ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                            }`}
                                    >
                                        🏪 Offline / Langsung
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsEcommerce(true)}
                                        className={`flex items-center justify-center gap-2 h-11 rounded-xl border text-sm font-medium transition ${isEcommerce
                                            ? "bg-sky-600 text-white border-sky-600"
                                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                            }`}
                                    >
                                        📦 E-Commerce
                                    </button>
                                </div>
                            </div>

                            {/* ── Platform E-Commerce (muncul jika toggle aktif) ── */}
                            {isEcommerce && (
                                <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 space-y-3">
                                    <p className="text-xs font-semibold text-sky-700 flex items-center gap-1.5">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 3H8l-2 4h12l-2-4z" />
                                        </svg>
                                        Transaksi E-Commerce — status PACKING sampai dana cair
                                    </p>
                                    <div>
                                        <label className="text-xs text-gray-500 mb-1.5 block">Platform *</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {(["SHOPEE", "TOKOPEDIA", "TIKTOK", "LAZADA"] as const).map(p => (
                                                <button
                                                    key={p}
                                                    type="button"
                                                    onClick={() => setEcommercePlatform(p)}
                                                    className={`h-10 rounded-xl border text-xs font-semibold transition ${ecommercePlatform === p
                                                        ? "bg-sky-600 text-white border-sky-600"
                                                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                                        }`}
                                                >
                                                    {p === "SHOPEE" ? "🛍 Shopee"
                                                        : p === "TOKOPEDIA" ? "🟢 Tokopedia"
                                                            : p === "TIKTOK" ? "🎵 TikTok Shop"
                                                                : "🟠 Lazada"}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 mb-1.5 block">No. Order (opsional)</label>
                                        <input
                                            type="text"
                                            placeholder="Contoh: 240605ABCDEF"
                                            className={inputClass}
                                            value={ecommerceOrderId}
                                            onChange={e => setEcommerceOrderId(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex items-start gap-2 bg-white/60 rounded-lg px-3 py-2 border border-sky-100">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                        </svg>
                                        <p className="text-[10px] text-sky-700 leading-relaxed">
                                            Dana dari {ecommercePlatform || "marketplace"} akan cair 1-3 hari kerja.
                                            Konfirmasi PAID setelah dana masuk via tombol <strong>Cair</strong> di halaman transaksi.
                                        </p>
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="text-xs text-gray-400 mb-1.5 block">Metode Pembayaran</label>
                                <select className={selectClass} {...register("payment_method")}>
                                    <option value="QRIS">QRIS</option>
                                    <option value="TRANSFER">Transfer</option>
                                    <option value="CASH">Cash</option>
                                </select>
                                {errors.payment_method && <p className="text-xs text-red-500 mt-1">{errors.payment_method.message}</p>}
                            </div>

                            <div>
                                <label className="text-xs text-gray-400 mb-1.5 block flex items-center gap-1.5">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                    </svg>
                                    Durasi Garansi
                                </label>
                                <div className="flex gap-2">
                                    {[7, 14, 30, 90].map(d => (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => setWarrantyDuration(d)}
                                            className={`flex-1 h-10 rounded-xl border text-xs font-semibold transition ${warrantyDuration === d
                                                ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                                                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                                }`}
                                        >
                                            {d}h
                                        </button>
                                    ))}
                                    <div className="relative flex-1">
                                        <input
                                            type="number"
                                            min={1}
                                            max={365}
                                            value={warrantyDuration}
                                            onChange={e => setWarrantyDuration(Number(e.target.value))}
                                            className="w-full h-10 border border-gray-200 rounded-xl px-3 pr-8 text-xs text-center bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e] transition"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">hr</span>
                                    </div>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1.5">
                                    Garansi berlaku {warrantyDuration} hari sejak transaksi.
                                </p>
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

                {/* ── Modal Konfirmasi Transaksi ── */}
                {showConfirmModal && selectedUnit && selectedLaptop && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                        <div
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={() => setShowConfirmModal(false)}
                        />

                        <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[85vh]">

                            <div className="bg-[#1a1a2e] px-5 py-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-amber-400 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <svg className="w-5 h-5 text-[#1a1a2e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="font-bold text-white text-sm">Konfirmasi Transaksi</p>
                                        <p className="text-xs text-slate-400 mt-0.5">Periksa detail sebelum menyimpan</p>
                                    </div>
                                </div>
                            </div>

                            <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
                                <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex justify-between items-center">
                                    <div>
                                        <p className="text-xs text-emerald-600 font-medium">Total Pembayaran</p>
                                        <p className="text-xl font-black text-emerald-700 mt-0.5">
                                            Rp{rawDealPrice.toLocaleString("id-ID")}
                                        </p>
                                    </div>
                                    <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200">
                                        {watch("payment_method")}
                                    </span>
                                </div>

                                <div className="space-y-2.5 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                                    <ConfirmRow icon="👤" label="Pembeli" value={watch("customer_name") || "—"} />
                                    {/* ✅ Tampilkan tipe customer */}
                                    <ConfirmRow
                                        icon={customerType === "RESELLER" ? "🔄" : customerType === "MITRA" ? "🤝" : "👤"}
                                        label="Tipe"
                                        value={customerType === "RESELLER" ? "Reseller" : customerType === "MITRA" ? "Mitra" : "Umum"}
                                    />
                                    <ConfirmRow icon="📱" label="WhatsApp" value={watch("customer_phone") || "—"} />
                                    <div className="h-px bg-gray-200" />
                                    <ConfirmRow icon="💻" label="Laptop" value={selectedLaptop.laptop_name} bold />
                                    <ConfirmRow icon="🔢" label="Serial Number" value={selectedUnit.serial_number} mono />
                                    <ConfirmRow icon="⭐" label="Grade" value={`Grade ${selectedUnit.grade}`} />
                                    {watch("software_request") && (
                                        <ConfirmRow icon="💿" label="Software" value={watch("software_request") || ""} />
                                    )}
                                    <div className="h-px bg-gray-200" />
                                    <ConfirmRow icon="📦" label="Pengambilan" value={watch("pickup_method") === "DATANG" ? "Datang ke Toko" : "Diantar"} />
                                    {watch("pickup_date") && (
                                        <ConfirmRow
                                            icon="📅"
                                            label="Tanggal"
                                            value={new Date(watch("pickup_date") || "").toLocaleDateString("id-ID", {
                                                weekday: "short", day: "numeric", month: "short", year: "numeric"
                                            })}
                                        />
                                    )}
                                    {watch("pickup_time") && (
                                        <ConfirmRow icon="⏰" label="Jam" value={watch("pickup_time") || ""} />
                                    )}
                                    <div className="h-px bg-gray-200" />
                                    <ConfirmRow icon="🛡️" label="Garansi" value={`${warrantyDuration} hari`} />
                                    {isEcommerce && (
                                        <>
                                            <div className="h-px bg-gray-200" />
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-sm">📦</span>
                                                    <span className="text-xs text-gray-400">E-Commerce</span>
                                                </div>
                                                <span className="text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                                                    {ecommercePlatform}
                                                </span>
                                            </div>
                                            {ecommerceOrderId && (
                                                <ConfirmRow icon="🔢" label="No. Order" value={ecommerceOrderId} mono />
                                            )}
                                            <div className="text-[10px] text-sky-600 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
                                                Status: <strong>PACKING</strong> — konfirmasi PAID setelah dana cair dari {ecommercePlatform}
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                                    <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <p className="text-xs text-amber-700">
                                        Transaksi yang sudah disimpan <span className="font-semibold">tidak dapat dibatalkan</span>.
                                    </p>
                                </div>
                            </div>

                            <div className="px-5 pb-6 pt-3 flex gap-3 border-t border-gray-100 bg-white flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmModal(false)}
                                    className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition active:scale-[0.98]"
                                >
                                    Periksa Lagi
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmedSubmit}
                                    disabled={submitting}
                                    className="flex-1 h-11 bg-[#1a1a2e] text-white rounded-xl text-sm font-semibold hover:bg-[#16213e] transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {submitting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Menyimpan...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            Ya, Simpan Transaksi
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Helper Components ────────────────────────────────────────────────────────
function ConfirmRow({ icon, label, value, bold, mono }: {
    icon: string;
    label: string;
    value: string;
    bold?: boolean;
    mono?: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-sm">{icon}</span>
                <span className="text-xs text-gray-400">{label}</span>
            </div>
            <span className={`text-xs text-right truncate max-w-[55%] ${bold ? "font-semibold text-gray-800" : "text-gray-600"} ${mono ? "font-mono" : ""}`}>
                {value}
            </span>
        </div>
    );
}

function UnitInfoCard({
    laptop,
    unit,
    rawDealPrice,
    setRawDealPrice,
    setValue,
    other,
    inputClass,
    canSeeMargin,
}: {
    laptop: LaptopOption;
    unit: UnitOption;
    rawDealPrice: number;
    setRawDealPrice: (n: number) => void;
    setValue: (name: any, value: any) => void;
    other: number;
    inputClass: string;
    canSeeMargin: boolean;
}) {
    const gradeColor = {
        A: "text-emerald-700 bg-emerald-50 border-emerald-200",
        B: "text-amber-700 bg-amber-50 border-amber-200",
        C: "text-red-700 bg-red-50 border-red-200",
    };

    return (
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
            <div>
                <p className="font-semibold text-[#1a1a2e] text-sm">{laptop.laptop_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                    {[laptop.cpu, laptop.ram, laptop.storage].filter(Boolean).join(" · ")}
                </p>
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
                <div className="flex-1">
                    <p className="text-xs text-gray-400 mb-0.5">Serial Number</p>
                    <p className="font-mono text-sm font-semibold text-[#1a1a2e]">{unit.serial_number}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${gradeColor[unit.grade] || gradeColor.A}`}>
                        Grade {unit.grade}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${unit.status === "SIAP_JUAL"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-red-50 text-red-600 border-red-200"
                        }`}>
                        {unit.status === "SIAP_JUAL" ? "✓ Siap Jual" : `⚠ ${unit.status}`}
                    </span>
                </div>
            </div>

            {unit.condition_note && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    {unit.condition_note}
                </p>
            )}

            {canSeeMargin && (
                <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
                    <span className="text-gray-500">Harga inventory</span>
                    <span className="font-medium text-gray-800">
                        Rp{(unit.selling_price || laptop.selling_price || 0).toLocaleString("id-ID")}
                    </span>
                </div>
            )}

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
    );
}