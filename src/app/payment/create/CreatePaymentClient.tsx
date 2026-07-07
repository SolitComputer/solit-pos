"use client";

import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createPaymentSchema, CreatePaymentType, UnitItem } from "@/lib/validation";
import { supabase } from "@/services/supabase";
import imageCompression from "browser-image-compression";
import { useSearchParams } from "next/navigation";
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
    purchase_price?: number;
    grade: "A" | "B" | "C" | null;
    selling_price: number;
    condition_note: string;
    status: string;
    laptop_id?: string;
    laptop_name?: string;
    // Aksesori fields (undefined untuk laptop units)
    unit_type?: "laptop" | "accessory";
    accessory_id?: string;
    accessory_name?: string;
    category?: string;
    condition?: "BARU" | "BEKAS";
}

const DRAFT_KEY = "payment_draft_v2";
function saveDraft(data: object) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch { }
}
function loadDraft(): Record<string, any> | null {
    try { const r = localStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { }
}

// ─── Format Currency ──────────────────────────────────────────────────────────
function fmt(n: number) {
    return "Rp" + (n || 0).toLocaleString("id-ID");
}

// ─── ConfirmRow Helper ────────────────────────────────────────────────────────
function ConfirmRow({ icon, label, value, bold, mono }: {
    icon: string; label: string; value: string; bold?: boolean; mono?: boolean;
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

// ─── Unit Card (di daftar terpilih) ──────────────────────────────────────────
function SelectedUnitCard({ unit, index, onRemove }: {
    unit: UnitItem & { grade?: string; condition_note?: string; purchase_price?: number }
    index: number;
    onRemove: () => void;
}) {
    return (
        <div className="flex items-center justify-between bg-gray-50 rounded-xl border border-gray-200 px-3 py-2.5">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-gray-500 bg-gray-200 rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0">
                        {index + 1}
                    </span>
                    <p className="text-xs font-semibold text-gray-800 truncate">{unit.laptop_name}</p>
                    {unit.grade && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-600 flex-shrink-0">
                            {unit.grade}
                        </span>
                    )}
                </div>
                <p className="text-[10px] font-mono text-gray-500 mt-0.5 ml-5.5">SN: {unit.serial_number}</p>
                <p className="text-[10px] text-gray-400 ml-5.5">Jual: {fmt(unit.selling_price)}</p>
            </div>
            <button
                type="button"
                onClick={onRemove}
                className="ml-2 text-red-400 hover:text-red-600 transition flex-shrink-0"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CreatePaymentPage() {
    const searchParams = useSearchParams();
    const urlUnitId = searchParams.get("unit_id") || "";
    const urlSn = searchParams.get("sn") || "";
    const fromScan = Boolean(urlUnitId && urlSn);

    const urlPrepId = searchParams.get("prep_id") || "";
    const fromPrep = Boolean(urlPrepId);
    const [prepOrderNumber, setPrepOrderNumber] = useState("");
    const [prepLoading, setPrepLoading] = useState(false);

    // ── Core state ────────────────────────────────────────────────────────────
    const [step, setStep] = useState(1);
    const [paymentPhoto, setPaymentPhoto] = useState<File | null>(null);
    const [latitude, setLatitude] = useState("");
    const [longitude, setLongitude] = useState("");
    const [gpsLoading, setGpsLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [warrantyDuration, setWarrantyDuration] = useState<number>(30);
    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const [draftRestored, setDraftRestored] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [pendingSubmitData, setPendingSubmitData] = useState<CreatePaymentType | null>(null);
    const [isSubmitted, setIsSubmitted] = useState(false);

    // ── Multi-unit state ──────────────────────────────────────────────────────
    const [selectedUnits, setSelectedUnits] = useState<(UnitItem & { grade?: string; condition_note?: string; purchase_price?: number })[]>([]);
    const [snSearch, setSnSearch] = useState("");
    const [snResults, setSnResults] = useState<UnitOption[]>([]);
    const [isLoadingUnits, setIsLoadingUnits] = useState(false);

    const [rawDealPrice, setRawDealPrice] = useState<number>(0);
    const [unitPrices, setUnitPrices] = useState<Record<string, number>>({});
    const [splitTF, setSplitTF] = useState<number>(0);
    const [splitCash, setSplitCash] = useState<number>(0);

    // ── Trade-in ──────────────────────────────────────────────────────────────
    const [isTradeIn, setIsTradeIn] = useState(false);
    const [tradeInItem, setTradeInItem] = useState("");
    const [tradeInValue, setTradeInValue] = useState<number>(0);
    const [tradeInCash, setTradeInCash] = useState<number>(0);

    // ── E-commerce ────────────────────────────────────────────────────────────
    const [isEcommerce, setIsEcommerce] = useState(false);
    const [ecommercePlatform, setEcommercePlatform] = useState<"SHOPEE" | "TOKOPEDIA" | "TIKTOK" | "LAZADA" | "">("");
    const [ecommerceOrderId, setEcommerceOrderId] = useState("");

    const [customerType, setCustomerType] = useState<"UMUM" | "RESELLER" | "MITRA">("UMUM");

    const [sellerType, setSellerType] = useState<"USER" | "PEDAGANG">("USER");

    const { register, handleSubmit, watch, setValue, formState: { errors } } =
        useForm<CreatePaymentType, any, CreatePaymentType>({
            resolver: zodResolver(createPaymentSchema) as any,
            defaultValues: {
                company_name: "Solit 03",
                payment_method: "CASH",
                pickup_method: "DATANG",
                source_platform: "Instagram",
                customer_type: "UMUM",
                customer_name: "",
                customer_phone: "",
                laptop_id: "",
                laptop_name: "",
                unit_id: "",
                serial_number: "",
                pickup_date: "",
                pickup_time: "",
                amount: 0,
                units: [],
                is_trade_in: false,
                trade_in_value: 0,
                trade_in_cash: 0,
                amount_method_1: 0,
                amount_method_2: 0,
            },
        });

    const paymentMethod = watch("payment_method");
    const pickupMethod = watch("pickup_method");

    const totalInventoryPrice = selectedUnits.reduce((s, u) => s + (u.purchase_price || 0), 0);
    const margin = rawDealPrice - totalInventoryPrice;
    const tradeInReceived = isTradeIn ? (rawDealPrice - tradeInValue) : 0;

    useEffect(() => {
        fetch("/api/auth/me")
            .then(r => r.json())
            .then(r => setUserRole(r.user?.role ?? null))
            .catch(() => setUserRole(null));
    }, []);

    const canSeeMargin = userRole
        ? hasPermission(userRole, ["ADMIN", "KEPALA_SALES", "ACCOUNTING", "PENGELOLA_BARANG"])
        : false;

    useEffect(() => {
        const total = selectedUnits.reduce(
            (sum, u) => sum + (unitPrices[u.unit_id] || 0),
            0
        );
        setRawDealPrice(total);
        setValue("amount", total);
    }, [unitPrices, selectedUnits, setValue]);

    useEffect(() => {
        if (fromScan || fromPrep) return;
        const draft = loadDraft();
        if (!draft) return;

        const fields = [
            "customer_name", "customer_phone", "company_name", "source_platform",
            "pickup_method", "pickup_date", "pickup_time", "pickup_location",
            "payment_method", "software_request", "notes", "amount", "customer_type",
        ] as const;
        fields.forEach(f => { if (draft[f] !== undefined) setValue(f as any, draft[f]); });

        if (draft._step) setStep(draft._step);
        if (draft._customerType) setCustomerType(draft._customerType);
        if (draft._sellerType) setSellerType(draft._sellerType);
        if (draft._selectedUnits) setSelectedUnits(draft._selectedUnits);
        if (draft._rawDealPrice) setRawDealPrice(draft._rawDealPrice);
        if (draft._unitPrices) setUnitPrices(draft._unitPrices);
        if (draft._isTradeIn) setIsTradeIn(draft._isTradeIn);
        if (draft._tradeInItem) setTradeInItem(draft._tradeInItem);
        if (draft._tradeInValue) setTradeInValue(draft._tradeInValue);
        if (draft._tradeInCash) setTradeInCash(draft._tradeInCash);
        if (draft._splitTF) setSplitTF(draft._splitTF);
        if (draft._splitCash) setSplitCash(draft._splitCash);

        setDraftRestored(true);
    }, []);

    // ── Auto-save draft ───────────────────────────────────────────────────────
    const watchedFields = watch();
    useEffect(() => {
        if (fromScan || fromPrep || isSubmitted) return;
        saveDraft({
            ...watchedFields,
            _step: step, _customerType: customerType, _sellerType: sellerType,
            _selectedUnits: selectedUnits, _rawDealPrice: rawDealPrice,
            _unitPrices: unitPrices,
            _isTradeIn: isTradeIn, _tradeInItem: tradeInItem,
            _tradeInValue: tradeInValue, _tradeInCash: tradeInCash,
            _splitTF: splitTF, _splitCash: splitCash,
            _savedAt: new Date().toISOString(),
        });
    }, [watchedFields, step, customerType, sellerType, selectedUnits, rawDealPrice,
        unitPrices, isTradeIn, tradeInItem, tradeInValue, tradeInCash, splitTF, splitCash, isSubmitted]);

    // ── Load unit dari scan ───────────────────────────────────────────────────
    useEffect(() => {
        if (!fromScan || !urlUnitId) return;
        const load = async () => {
            try {
                const res = await fetch(`/api/units/check-sn?sn=${encodeURIComponent(urlSn)}`);
                const result = await res.json();
                if (!result.success) return;
                const unit = result.data;
                const laptop = unit.laptop;
                const item: UnitItem & { grade?: string; condition_note?: string; purchase_price?: number } = {
                    unit_id: unit.id,
                    laptop_id: laptop.id,
                    serial_number: unit.serial_number,
                    laptop_name: laptop.laptop_name,
                    grade: unit.grade,
                    selling_price: unit.selling_price ?? 0,
                    condition_note: unit.condition_note,
                };
                setSelectedUnits([item]);
                setValue("units", [item]);
                setValue("laptop_name", laptop.laptop_name);
                setValue("serial_number", unit.serial_number);
                setValue("laptop_id", laptop.id);
                setValue("unit_id", unit.id);
            } catch { }
        };
        load();
    }, [fromScan, urlUnitId, urlSn, setValue]);

    // ── Load data dari Penyiapan Barang (auto-isi customer + unit) ──────────────
    useEffect(() => {
        if (!fromPrep || !urlPrepId) return;
        const loadPrep = async () => {
            setPrepLoading(true);
            try {
                const res = await fetch(`/api/preparation/${urlPrepId}`);
                const result = await res.json();
                if (!result.success || !result.data) return;
                const prep = result.data;

                setPrepOrderNumber(prep.order_number || "");
                if (prep.customer_name) setValue("customer_name", prep.customer_name);
                if (prep.customer_phone) setValue("customer_phone", prep.customer_phone);
                if (prep.delivery_method === "PENGANTARAN" && prep.delivery_address) {
                    setValue("pickup_method", "DIANTAR");
                    setValue("pickup_location", prep.delivery_address);
                }

                // Resolve tiap SN → unit valid dari stok (SN manual yg tak terdaftar dilewati)
                const items: any[] = Array.isArray(prep.preparation_items) ? prep.preparation_items : [];
                const settled = await Promise.allSettled(
                    items.map((it) =>
                        fetch(`/api/units/check-sn?sn=${encodeURIComponent(it.serial_number)}`)
                            .then(r => r.json())
                            .then(ur => ({ ur, it }))
                    )
                );

                const resolved: (UnitItem & { grade?: string; condition_note?: string; purchase_price?: number })[] = [];
                for (const s of settled) {
                    if (s.status !== "fulfilled") continue;
                    const { ur, it } = s.value;
                    if (!ur.success || !ur.data) continue;
                    const u = ur.data;
                    const laptop = u.laptop;
                    resolved.push({
                        unit_id: u.id,
                        laptop_id: laptop?.id ?? "",
                        serial_number: u.serial_number,
                        laptop_name: laptop?.laptop_name ?? it.laptop_name ?? "",
                        grade: u.grade ?? undefined,
                        selling_price: u.selling_price ?? 0,
                        purchase_price: u.purchase_price ?? 0,
                        condition_note: u.condition_note ?? "",
                    });
                }

                if (resolved.length > 0) {
                    setSelectedUnits(resolved);
                    setValue("units", resolved);
                }
            } catch { /* ignore */ } finally {
                setPrepLoading(false);
            }
        };
        loadPrep();
    }, [fromPrep, urlPrepId, setValue]);

    // ── Search SN ─────────────────────────────────────────────────────────────
    const handleSnSearch = useCallback(async (q: string) => {
        if (q.length < 2) { setSnResults([]); return; }
        setIsLoadingUnits(true);
        try {
            const res = await fetch(`/api/units/search-sn?q=${encodeURIComponent(q)}`);
            const result = await res.json();
            // Filter out already-selected units
            const selectedIds = new Set(selectedUnits.map(u => u.unit_id));
            setSnResults((result.data || []).filter((u: any) => !selectedIds.has(u.id)));
        } catch {
            setSnResults([]);
        } finally {
            setIsLoadingUnits(false);
        }
    }, [selectedUnits]);

    const handleSelectSnResult = (u: UnitOption) => {
        const item: UnitItem & {
            grade?: string | null;
            condition_note?: string;
            purchase_price?: number;
            unit_type?: "laptop" | "accessory";
        } = {
            unit_id: u.id,
            // Untuk aksesori, laptop_id diisi accessory_id (konsistensi field)
            laptop_id: u.unit_type === "accessory" ? (u.accessory_id ?? "") : (u.laptop_id ?? ""),
            serial_number: u.serial_number,
            purchase_price: u.purchase_price ?? 0,
            laptop_name: u.laptop_name ?? "",
            grade: u.grade ?? undefined,
            selling_price: u.selling_price ?? 0,
            condition_note: u.condition_note ?? "",
            unit_type: u.unit_type,
        };
        const newUnits = [...selectedUnits, item];
        setSelectedUnits(newUnits);
        setValue("units", newUnits);
        setSnSearch("");
        setSnResults([]);
    };

    const handleRemoveUnit = (idx: number) => {
        const newUnits = selectedUnits.filter((_, i) => i !== idx);
        setSelectedUnits(newUnits);
        setValue("units", newUnits);
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

    // ── Photo ─────────────────────────────────────────────────────────────────
    const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const compressed = await imageCompression(file, {
                maxSizeMB: 0.1, maxWidthOrHeight: 800,
                useWebWorker: true, initialQuality: 0.7,
            });
            setPaymentPhoto(new File([compressed], file.name, { type: compressed.type }));
        } catch { setPaymentPhoto(file); }
    };

    const onSubmit = async (data: CreatePaymentType) => {
        if (!selectedUnits.length) { alert("Pilih minimal 1 unit"); return; }

        if (!rawDealPrice || rawDealPrice < 1000) {
            alert("Harga deal minimal Rp1.000");
            return;
        }

        if (!paymentPhoto) { alert("Foto pembayaran wajib diupload"); return; }
        if (!latitude || !longitude) { alert("GPS wajib diambil"); return; }

        if (data.payment_method === "TF_CASH") {
            if (splitTF <= 0 && splitCash <= 0) {
                alert("Isi nominal Transfer dan Cash terlebih dahulu");
                return;
            }
            if (splitTF + splitCash !== rawDealPrice) {
                alert(
                    `Jumlah TF (${fmt(splitTF)}) + Cash (${fmt(splitCash)}) = ${fmt(splitTF + splitCash)}\n` +
                    `Harus sama dengan total: ${fmt(rawDealPrice)}`
                );
                return;
            }
        }

        if (isEcommerce && !ecommercePlatform) {
            alert("Pilih platform e-commerce terlebih dahulu");
            return;
        }

        setPendingSubmitData({
            ...data,
            units: selectedUnits,
            amount: rawDealPrice,
            amount_method_1: data.payment_method === "TF_CASH" ? splitTF : 0,
            amount_method_2: data.payment_method === "TF_CASH" ? splitCash : 0,
            payment_method_2: data.payment_method === "TF_CASH" ? "CASH" : undefined,
            is_trade_in: isTradeIn,
            trade_in_item: isTradeIn ? tradeInItem : undefined,
            trade_in_value: isTradeIn ? tradeInValue : 0,
            trade_in_cash: isTradeIn ? tradeInCash : 0,
        });
        setShowConfirmModal(true);
    };

    const handleConfirmedSubmit = async () => {
        if (!pendingSubmitData || !paymentPhoto) return;
        setShowConfirmModal(false);
        setSubmitting(true);
        try {
            // Upload foto
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
                    payment_photo: imageData.publicUrl,
                    latitude, longitude,
                    warranty_duration: warrantyDuration,
                    seller_type: sellerType,
                    is_ecommerce: isEcommerce,
                    ecommerce_platform: isEcommerce ? ecommercePlatform : null,
                    ecommerce_order_id: isEcommerce ? ecommerceOrderId : null,
                    unit_prices: selectedUnits.map(u => ({
                        unit_id: u.unit_id,
                        deal_price: unitPrices[u.unit_id] || 0,
                    })),
                }),
            });
            const result = await res.json();
            if (!result.success) { alert(result.message); return; }

            if (fromPrep && urlPrepId && result.invoice_number) {
                try {
                    await fetch(`/api/preparation/${urlPrepId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ transaction_invoice: result.invoice_number }),
                    });
                } catch { /* non-blocking */ }
            }

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

    // ── Styles ────────────────────────────────────────────────────────────────
    const inputClass = "border border-gray-200 rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 bg-white w-full transition-all duration-200";
    const selectClass = "border border-gray-200 rounded-xl h-11 px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 w-full transition-all duration-200";
    const btnSecondary = "flex-1 bg-white text-gray-600 border border-gray-200 rounded-xl h-11 font-medium hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98] transition-all duration-200 text-sm";
    const btnPrimary = "flex-1 bg-gray-700 text-white rounded-xl h-11 font-medium hover:bg-gray-800 active:scale-[0.98] transition-all duration-200 text-sm shadow-sm";

    const stepLabels = ["Data Pembeli", "Pilih Unit", "Pengambilan", "Pembayaran"];
    const goBack3 = () => fromScan ? setStep(1) : setStep(2);

    return (
        <div className="max-w-lg mx-auto px-4 py-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all duration-300">

                {/* Header */}
                <div className="mb-5">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-1 h-7 bg-gradient-to-b from-gray-600 to-gray-800 rounded-full" />
                        <h1 className="text-xl font-bold bg-gradient-to-r from-gray-800 to-gray-900 bg-clip-text text-transparent">
                            Buat Payment
                        </h1>
                    </div>
                    <p className="text-xs text-gray-400 ml-3">{stepLabels[step - 1]}</p>
                </div>

                {/* Step indicator */}
                <div className="flex gap-1.5 mb-6">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${step > i ? "bg-gray-600" : step === i ? "bg-gray-400" : "bg-gray-200"
                            }`} />
                    ))}
                </div>

                {fromPrep && (
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 mb-4">
                        <svg className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                            <p className="text-xs font-semibold text-emerald-700">
                                {prepLoading ? "Memuat data penyiapan..." : "Data dari penyiapan barang"}
                            </p>
                            {prepOrderNumber && <p className="text-xs text-emerald-600 font-mono">{prepOrderNumber}</p>}
                        </div>
                    </div>
                )}

                {/* Scan banner */}
                {fromScan && (
                    <div className="flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 mb-4">
                        <svg className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                            <p className="text-xs font-semibold text-gray-700">Unit dari scan barcode</p>
                            <p className="text-xs text-gray-500 font-mono">{urlSn}</p>
                        </div>
                    </div>
                )}

                {draftRestored && !fromScan && (
                    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-4">
                        <div className="flex items-center gap-2">
                            <svg className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <p className="text-xs font-semibold text-gray-700">Draft tersimpan dipulihkan</p>
                        </div>
                        <button type="button" onClick={() => { clearDraft(); window.location.reload(); }}
                            className="text-xs text-gray-500 hover:text-gray-700 transition underline">
                            Mulai baru
                        </button>
                    </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
                    <input type="hidden" {...register("laptop_id")} />
                    <input type="hidden" {...register("laptop_name")} />
                    <input type="hidden" {...register("serial_number")} />
                    <input type="hidden" {...register("unit_id" as any)} />
                    <input type="hidden" {...register("customer_type")} />

                    {/* ──────────────────────── STEP 1: Data Pembeli ─────────────────── */}
                    {step === 1 && (
                        <>
                            <input type="text" placeholder="Atas Nama *" className={inputClass} {...register("customer_name")} />

                            <div>
                                <label className="text-xs text-gray-500 mb-1.5 block">Tipe Customer *</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { value: "UMUM", label: "Umum", icon: "👤", desc: "Pembeli biasa" },
                                        { value: "RESELLER", label: "Reseller", icon: "🔄", desc: "Jual kembali" },
                                        { value: "MITRA", label: "Mitra", icon: "🤝", desc: "Mitra bisnis" },
                                    ].map(o => (
                                        <button key={o.value} type="button"
                                            onClick={() => { setCustomerType(o.value as any); setValue("customer_type", o.value as any); }}
                                            className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all duration-200 ${customerType === o.value
                                                ? "border-gray-600 bg-gray-50 ring-2 ring-gray-600/20"
                                                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                                                }`}
                                        >
                                            <span className="text-xl">{o.icon}</span>
                                            <span className={`text-xs font-medium ${customerType === o.value ? "text-gray-800" : "text-gray-600"}`}>{o.label}</span>
                                            <span className="text-[9px] text-gray-400">{o.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-gray-500 mb-1.5 block">Kategori Seller *</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { value: "USER", label: "User", icon: "🙋", desc: "Follow-up 7 hari" },
                                        { value: "PEDAGANG", label: "Pedagang", icon: "🏷️", desc: "Follow-up 3 hari" },
                                    ].map(o => (
                                        <button key={o.value} type="button"
                                            onClick={() => setSellerType(o.value as any)}
                                            className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all duration-200 ${sellerType === o.value
                                                ? "border-gray-600 bg-gray-50 ring-2 ring-gray-600/20"
                                                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                                                }`}
                                        >
                                            <span className="text-xl">{o.icon}</span>
                                            <span className={`text-xs font-medium ${sellerType === o.value ? "text-gray-800" : "text-gray-600"}`}>{o.label}</span>
                                            <span className="text-[9px] text-gray-400">{o.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <input type="text" placeholder="Nama Perusahaan" className={inputClass} {...register("company_name")} />                            <input type="tel" placeholder="No. WhatsApp *" className={inputClass} {...register("customer_phone")} />

                            <div>
                                <label className="text-xs text-gray-500 mb-1.5 block">Tahu Solit dari mana?</label>
                                <select className={selectClass} {...register("source_platform")}>
                                    // AFTER
                                    {[
                                        "Ads Facebook",
                                        "Ads Instagram",
                                        "Instagram",
                                        "TikTok",
                                        "Facebook",
                                        "WhatsApp",
                                        "Google",
                                        "Shopee",
                                        "Tokopedia",
                                        "Teman",
                                        "Lainnya"
                                    ].map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>

                            <button type="button" onClick={() => {
                                if (!watch("customer_name")) { alert("Isi nama customer dulu"); return; }
                                if (!watch("customer_phone")) { alert("Isi nomor WhatsApp dulu"); return; }
                                fromScan ? setStep(3) : setStep(2);
                            }} className={`w-full ${btnPrimary}`}>
                                Lanjut →
                            </button>
                        </>
                    )}

                    {/* ──────────────────────── STEP 2: Pilih Unit ───────────────────── */}
                    {step === 2 && !fromScan && (
                        <>
                            {/* Search SN */}
                            <div>
                                <label className="text-xs text-gray-500 mb-1.5 block">
                                    Cari & Tambah Serial Number
                                    {selectedUnits.length > 0 && (
                                        <span className="ml-1.5 text-gray-700 font-semibold">({selectedUnits.length} unit terpilih)</span>
                                    )}
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Ketik SN unit..."
                                        className={inputClass}
                                        value={snSearch}
                                        onChange={e => { setSnSearch(e.target.value); handleSnSearch(e.target.value); }}
                                    />
                                    {isLoadingUnits && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
                                        </div>
                                    )}
                                </div>

                                {/* Dropdown hasil search */}
                                {snResults.length > 0 && (
                                    <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
                                        {snResults.map(u => (
                                            <button key={u.id} type="button" onClick={() => handleSelectSnResult(u)}
                                                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition border-b border-gray-100 last:border-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-mono text-sm font-semibold text-gray-800">{u.serial_number}</p>
                                                    {u.unit_type === "accessory" ? (
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-600 flex-shrink-0">
                                                            AKSESORI
                                                        </span>
                                                    ) : (
                                                        u.grade && (
                                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-600 flex-shrink-0">
                                                                Grade {u.grade}
                                                            </span>
                                                        )
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {u.laptop_name}
                                                    {u.unit_type === "accessory" && u.condition ? ` · ${u.condition}` : ""}
                                                    {u.selling_price ? ` · ${fmt(u.selling_price)}` : ""}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {snSearch.length >= 2 && snResults.length === 0 && !isLoadingUnits && (
                                    <p className="text-xs text-red-500 mt-1.5 px-1">SN tidak ditemukan atau sudah dipilih</p>
                                )}
                            </div>

                            {/* Daftar unit terpilih */}
                            {selectedUnits.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-semibold text-gray-600">
                                            Unit Terpilih ({selectedUnits.length})
                                        </label>
                                    </div>
                                    {selectedUnits.map((u, i) => (
                                        <SelectedUnitCard key={u.unit_id} unit={u} index={i} onRemove={() => handleRemoveUnit(i)} />
                                    ))}

                                    {/* Harga Deal per Unit */}
                                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                                        <label className="text-xs text-gray-500 block">
                                            Harga Deal per Unit *
                                            <span className="ml-1.5 text-gray-400">({selectedUnits.length} unit)</span>
                                        </label>

                                        {selectedUnits.map((u, i) => (
                                            <div key={u.unit_id} className="space-y-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] font-bold text-gray-500 bg-gray-200 rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0">
                                                        {i + 1}
                                                    </span>
                                                    <p className="text-xs font-semibold text-gray-700 truncate flex-1">{u.laptop_name}</p>
                                                    {u.grade && (
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-600 flex-shrink-0">
                                                            {u.grade}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[10px] font-mono text-gray-400 ml-5.5">SN: {u.serial_number}</p>
                                                <input
                                                    type="text" inputMode="numeric"
                                                    placeholder="Harga deal unit ini"
                                                    className={inputClass}
                                                    defaultValue={unitPrices[u.unit_id] > 0 ? unitPrices[u.unit_id].toLocaleString("id-ID") : ""}
                                                    onChange={e => {
                                                        const raw = e.target.value.replace(/\D/g, "");
                                                        const num = raw ? Number(raw) : 0;
                                                        setUnitPrices(prev => ({ ...prev, [u.unit_id]: num }));
                                                    }}
                                                    onBlur={e => {
                                                        const raw = e.target.value.replace(/\D/g, "");
                                                        if (raw) e.target.value = Number(raw).toLocaleString("id-ID");
                                                    }}
                                                    onFocus={e => { e.target.value = e.target.value.replace(/\D/g, ""); }}
                                                />
                                            </div>
                                        ))}

                                        {/* Total otomatis */}
                                        <div className="flex justify-between text-xs border-t border-gray-200 pt-2.5">
                                            <span className="text-gray-600 font-semibold">Total ({selectedUnits.length} unit)</span>
                                            <span className="font-bold text-gray-800 font-mono">{fmt(rawDealPrice)}</span>
                                        </div>

                                        {rawDealPrice > 0 && canSeeMargin && (
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-500">Selisih / Margin</span>
                                                <span className={`font-semibold ${margin >= 0 ? "text-gray-600" : "text-red-500"}`}>
                                                    {margin >= 0 ? "+" : ""}{fmt(margin)}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* ── Trade-In Toggle ── */}
                                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                                        <button
                                            type="button"
                                            onClick={() => setIsTradeIn(!isTradeIn)}
                                            className={`w-full flex items-center justify-between px-4 py-3 transition ${isTradeIn ? "bg-amber-50 border-amber-200" : "bg-white hover:bg-gray-50"
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="text-base">🔁</span>
                                                <div className="text-left">
                                                    <p className="text-xs font-semibold text-gray-700">Tukar Tambah</p>
                                                    <p className="text-[10px] text-gray-400">Customer punya barang untuk ditukar</p>
                                                </div>
                                            </div>
                                            <div className={`w-10 h-6 rounded-full transition-colors relative ${isTradeIn ? "bg-amber-500" : "bg-gray-200"}`}>
                                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${isTradeIn ? "left-5" : "left-1"}`} />
                                            </div>
                                        </button>

                                        {isTradeIn && (
                                            <div className="px-4 pb-4 pt-2 space-y-3 bg-amber-50 border-t border-amber-200">
                                                <div>
                                                    <label className="text-xs text-gray-500 mb-1.5 block">Nama Barang Tukar *</label>
                                                    <input
                                                        type="text" placeholder="Contoh: Laptop Dell XPS 15"
                                                        className={inputClass}
                                                        value={tradeInItem}
                                                        onChange={e => setTradeInItem(e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-gray-500 mb-1.5 block">Nilai Barang Tukar *</label>
                                                    <input
                                                        type="text" inputMode="numeric"
                                                        placeholder="Harga barang yang ditukar"
                                                        className={inputClass}
                                                        onChange={e => {
                                                            const raw = e.target.value.replace(/\D/g, "");
                                                            const num = raw ? Number(raw) : 0;
                                                            setTradeInValue(num);
                                                            // Cash tambahan = deal_price - trade_in_value
                                                            setTradeInCash(rawDealPrice > 0 ? Math.max(0, rawDealPrice - num) : 0);
                                                        }}
                                                        onBlur={e => {
                                                            const raw = e.target.value.replace(/\D/g, "");
                                                            if (raw) e.target.value = Number(raw).toLocaleString("id-ID");
                                                        }}
                                                        onFocus={e => { e.target.value = e.target.value.replace(/\D/g, ""); }}
                                                    />
                                                </div>
                                                {tradeInValue > 0 && rawDealPrice > 0 && (
                                                    <div className="bg-white rounded-xl border border-amber-200 px-3 py-2.5 space-y-1.5">
                                                        <div className="flex justify-between text-xs">
                                                            <span className="text-gray-500">Harga laptop</span>
                                                            <span className="font-medium text-gray-700">{fmt(rawDealPrice)}</span>
                                                        </div>
                                                        <div className="flex justify-between text-xs">
                                                            <span className="text-gray-500">Nilai barang tukar</span>
                                                            <span className="font-medium text-amber-700">− {fmt(tradeInValue)}</span>
                                                        </div>
                                                        <div className="h-px bg-amber-100" />
                                                        <div className="flex justify-between text-xs">
                                                            <span className="text-gray-600 font-semibold">Cash tambahan dari customer</span>
                                                            <span className="font-bold text-gray-800">{fmt(Math.max(0, rawDealPrice - tradeInValue))}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <input type="text" placeholder="Request Software (opsional)" className={inputClass} {...register("software_request")} />

                            <div className="flex gap-2 pt-1">
                                <button type="button" onClick={() => setStep(1)} className={btnSecondary}>← Kembali</button>
                                <button type="button" onClick={() => {
                                    if (!selectedUnits.length) { alert("Cari dan pilih minimal 1 unit dulu"); return; }
                                    if (!rawDealPrice) { alert("Masukkan harga deal"); return; }
                                    if (isTradeIn && !tradeInItem) { alert("Isi nama barang tukar"); return; }
                                    if (isTradeIn && !tradeInValue) { alert("Isi nilai barang tukar"); return; }
                                    setStep(3);
                                }} className={btnPrimary}>
                                    Lanjut →
                                </button>
                            </div>
                        </>
                    )}

                    {/* ──────────────────────── STEP 3: Pengambilan ──────────────────── */}
                    {(step === 3 || (step === 2 && fromScan)) && (
                        <>
                            {/* Ringkasan unit (scan) */}
                            {fromScan && selectedUnits.length > 0 && (
                                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2 mb-1">
                                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Unit Terpilih</p>
                                    {selectedUnits.map((u, i) => (
                                        <div key={u.unit_id} className="space-y-1.5 pb-2">
                                            <div className="text-xs text-gray-700">
                                                <span className="font-semibold">{i + 1}. {u.laptop_name}</span>
                                                <span className="font-mono text-gray-500 ml-2">SN: {u.serial_number}</span>
                                            </div>
                                            <input
                                                type="text" inputMode="numeric"
                                                placeholder="Harga deal unit ini"
                                                className={inputClass}
                                                defaultValue={unitPrices[u.unit_id] > 0 ? unitPrices[u.unit_id].toLocaleString("id-ID") : ""}
                                                onChange={e => {
                                                    const raw = e.target.value.replace(/\D/g, "");
                                                    const num = raw ? Number(raw) : 0;
                                                    setUnitPrices(prev => ({ ...prev, [u.unit_id]: num }));
                                                }}
                                                onBlur={e => {
                                                    const raw = e.target.value.replace(/\D/g, "");
                                                    if (raw) e.target.value = Number(raw).toLocaleString("id-ID");
                                                }}
                                                onFocus={e => { e.target.value = e.target.value.replace(/\D/g, ""); }}
                                            />
                                        </div>
                                    ))}
                                    <div className="flex justify-between text-xs border-t border-gray-200 pt-2">
                                        <span className="text-gray-600 font-semibold">Total</span>
                                        <span className="font-bold text-gray-800 font-mono">{fmt(rawDealPrice)}</span>
                                    </div>
                                    {rawDealPrice > 0 && canSeeMargin && (
                                        <div className="flex justify-between text-sm pt-1">
                                            <span className="text-gray-500">Selisih</span>
                                            <span className={`font-semibold ${margin >= 0 ? "text-gray-600" : "text-red-500"}`}>
                                                {margin >= 0 ? "+" : ""}{fmt(margin)}
                                            </span>
                                        </div>
                                    )}
                                    <input type="text" placeholder="Request Software (opsional)" className={inputClass} {...register("software_request")} />
                                </div>
                            )}

                            <div>
                                <label className="text-xs text-gray-500 mb-1.5 block">Metode Pengambilan</label>
                                <select className={selectClass} {...register("pickup_method")}>
                                    <option value="DATANG">Datang ke toko</option>
                                    <option value="DIANTAR">Diantar</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1.5 block">Tanggal</label>
                                <input type="date" className={inputClass} {...register("pickup_date")} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1.5 block">Jam</label>
                                <input type="time" className={inputClass} {...register("pickup_time")} />
                            </div>
                            {pickupMethod === "DIANTAR" && (
                                <input type="text" placeholder="Alamat pengiriman" className={inputClass} {...register("pickup_location")} />
                            )}
                            <div className="flex gap-2 pt-1">
                                <button type="button" onClick={goBack3} className={btnSecondary}>← Kembali</button>
                                <button type="button" onClick={() => {
                                    if (fromScan && !rawDealPrice) { alert("Masukkan harga deal dulu"); return; }
                                    setStep(4);
                                }} className={btnPrimary}>
                                    Lanjut →
                                </button>
                            </div>
                        </>
                    )}

                    {/* ──────────────────────── STEP 4: Pembayaran ───────────────────── */}
                    {step === 4 && (
                        <>
                            {/* Jenis penjualan */}
                            <div>
                                <label className="text-xs text-gray-500 mb-1.5 block">Jenis Penjualan</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => { setIsEcommerce(false); setEcommercePlatform(""); }}
                                        className={`flex items-center justify-center gap-2 h-11 rounded-xl border text-sm font-medium transition ${!isEcommerce ? "bg-gray-700 text-white border-gray-700 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                            }`}>
                                        🏪 Offline / Langsung
                                    </button>
                                    <button type="button" onClick={() => setIsEcommerce(true)}
                                        className={`flex items-center justify-center gap-2 h-11 rounded-xl border text-sm font-medium transition ${isEcommerce ? "bg-gray-600 text-white border-gray-600 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                            }`}>
                                        📦 E-Commerce
                                    </button>
                                </div>
                            </div>

                            {isEcommerce && (
                                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                                    <p className="text-xs font-semibold text-gray-700">📦 Status PACKING sampai dana cair</p>
                                    <div>
                                        <label className="text-xs text-gray-500 mb-1.5 block">Platform *</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {(["SHOPEE", "TOKOPEDIA", "TIKTOK", "LAZADA"] as const).map(p => (
                                                <button key={p} type="button" onClick={() => setEcommercePlatform(p)}
                                                    className={`h-10 rounded-xl border text-xs font-semibold transition ${ecommercePlatform === p ? "bg-gray-600 text-white border-gray-600 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                                        }`}>
                                                    {p === "SHOPEE" ? "🛍 Shopee" : p === "TOKOPEDIA" ? "🟢 Tokopedia" : p === "TIKTOK" ? "🎵 TikTok" : "🟠 Lazada"}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <input type="text" placeholder="No. Order (opsional)" className={inputClass}
                                        value={ecommerceOrderId} onChange={e => setEcommerceOrderId(e.target.value)} />
                                </div>
                            )}

                            {/* ── Metode Pembayaran ── */}
                            <div>
                                <label className="text-xs text-gray-500 mb-1.5 block">Metode Pembayaran</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { value: "CASH", label: "💵 Cash", desc: "Uang tunai" },
                                        { value: "TRANSFER", label: "🏦 Transfer", desc: "Transfer bank" },
                                        { value: "QRIS", label: "📱 QRIS", desc: "QR Code" },
                                        { value: "TF_CASH", label: "🔀 TF + Cash", desc: "Sebagian TF, sebagian tunai" },
                                    ].map(m => (
                                        <button key={m.value} type="button"
                                            onClick={() => {
                                                setValue("payment_method", m.value as any);
                                                if (m.value !== "TF_CASH") { setSplitTF(0); setSplitCash(0); }
                                            }}
                                            className={`flex flex-col items-center justify-center gap-0.5 h-14 rounded-xl border text-sm font-medium transition ${paymentMethod === m.value
                                                ? "bg-gray-700 text-white border-gray-700 shadow-sm"
                                                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                                }`}
                                        >
                                            <span className="text-base leading-none">{m.label.split(" ")[0]}</span>
                                            <span className="text-xs">{m.label.split(" ").slice(1).join(" ")}</span>
                                            <span className={`text-[9px] ${paymentMethod === m.value ? "text-gray-300" : "text-gray-400"}`}>{m.desc}</span>
                                        </button>
                                    ))}
                                </div>

                                {/* Split TF + Cash form */}
                                {paymentMethod === "TF_CASH" && rawDealPrice > 0 && (
                                    <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-3">
                                        <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                                            🔀 Rincian Pembayaran — Total: <span className="font-bold">{fmt(rawDealPrice)}</span>
                                        </p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-[10px] text-blue-600 mb-1 block">Transfer (Rp)</label>
                                                <input
                                                    type="text" inputMode="numeric" placeholder="0"
                                                    className="border border-blue-200 rounded-xl h-10 px-3 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-300 transition"
                                                    onChange={e => {
                                                        const raw = e.target.value.replace(/\D/g, "");
                                                        const num = raw ? Number(raw) : 0;
                                                        setSplitTF(num);
                                                        setSplitCash(Math.max(0, rawDealPrice - num));
                                                    }}
                                                    onBlur={e => {
                                                        const raw = e.target.value.replace(/\D/g, "");
                                                        if (raw) e.target.value = Number(raw).toLocaleString("id-ID");
                                                    }}
                                                    onFocus={e => { e.target.value = e.target.value.replace(/\D/g, ""); }}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-blue-600 mb-1 block">Cash (Rp)</label>
                                                <input
                                                    type="text" inputMode="numeric" placeholder="0"
                                                    className="border border-blue-200 rounded-xl h-10 px-3 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-300 transition"
                                                    value={splitCash > 0 ? splitCash.toLocaleString("id-ID") : ""}
                                                    onChange={e => {
                                                        const raw = e.target.value.replace(/\D/g, "");
                                                        const num = raw ? Number(raw) : 0;
                                                        setSplitCash(num);
                                                        setSplitTF(Math.max(0, rawDealPrice - num));
                                                    }}
                                                    onFocus={e => { e.target.value = e.target.value.replace(/\D/g, ""); }}
                                                    onBlur={e => {
                                                        const raw = e.target.value.replace(/\D/g, "");
                                                        if (raw) e.target.value = Number(raw).toLocaleString("id-ID");
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        {/* Validasi visual */}
                                        {splitTF + splitCash > 0 && (
                                            <div className={`flex justify-between text-xs px-1 ${splitTF + splitCash === rawDealPrice ? "text-green-700" : "text-red-600"
                                                }`}>
                                                <span>Total diisi: {fmt(splitTF + splitCash)}</span>
                                                <span>{splitTF + splitCash === rawDealPrice ? "✓ Sesuai" : `Kurang/Lebih ${fmt(Math.abs(rawDealPrice - splitTF - splitCash))}`}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Garansi */}
                            <div>
                                <label className="text-xs text-gray-500 mb-1.5 block flex items-center gap-1.5">
                                    🛡️ Durasi Garansi
                                </label>
                                <div className="flex gap-2">
                                    {[7, 14, 30, 90].map(d => (
                                        <button key={d} type="button" onClick={() => setWarrantyDuration(d)}
                                            className={`flex-1 h-10 rounded-xl border text-xs font-semibold transition ${warrantyDuration === d ? "bg-gray-700 text-white border-gray-700 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                                }`}>
                                            {d}h
                                        </button>
                                    ))}
                                    <div className="relative flex-1">
                                        <input type="number" min={1} max={365} value={warrantyDuration}
                                            onChange={e => setWarrantyDuration(Number(e.target.value))}
                                            className="w-full h-10 border border-gray-200 rounded-xl px-3 pr-8 text-xs text-center bg-white focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 transition"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">hr</span>
                                    </div>
                                </div>
                            </div>

                            {/* Foto */}
                            <div>
                                <label className="text-xs text-gray-500 mb-1.5 block">Foto Bukti Pembayaran *</label>
                                <input type="file" accept="image/*" capture="environment"
                                    className="border border-gray-200 rounded-xl p-3 text-sm w-full bg-white file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 transition"
                                    onChange={handlePhotoChange}
                                />
                                {paymentPhoto && <p className="text-xs text-gray-600 mt-1">✓ {paymentPhoto.name}</p>}
                            </div>

                            {/* GPS */}
                            <div className="border border-gray-200 rounded-xl p-4 flex justify-between items-center">
                                <div>
                                    <p className="text-sm font-medium text-gray-800">GPS Lokasi</p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {latitude ? "✓ Koordinat berhasil diambil" : "Wajib diambil sebelum simpan"}
                                    </p>
                                </div>
                                <button type="button" onClick={getLocation}
                                    className={`px-4 py-2 rounded-xl text-sm font-medium transition active:scale-95 ${latitude ? "bg-gray-100 text-gray-700 border border-gray-200" : "bg-gray-700 text-white hover:bg-gray-800"
                                        }`}>
                                    {gpsLoading ? "..." : latitude ? "✓ Diambil" : "Ambil GPS"}
                                </button>
                            </div>

                            <input type="text" placeholder="Catatan (opsional)" className={inputClass} {...register("notes")} />

                            <div className="flex gap-2 pt-1">
                                <button type="button" onClick={() => setStep(3)} className={btnSecondary}>← Kembali</button>
                                <button
                                    type="button"
                                    disabled={submitting}
                                    onClick={() => {
                                        setValue("units", selectedUnits);
                                        setValue("amount", rawDealPrice);
                                        handleSubmit(onSubmit)();
                                    }}
                                    className={`${btnPrimary} disabled:opacity-50`}
                                >
                                    {submitting ? "Menyimpan..." : "Simpan Transaksi"}
                                </button>
                            </div>
                        </>
                    )}
                </form>

                {/* ── Modal Konfirmasi ── */}
                {showConfirmModal && selectedUnits.length > 0 && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
                        <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]">

                            <div className="bg-gray-700 px-5 py-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-gray-500 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="font-bold text-white text-sm">Konfirmasi Transaksi</p>
                                        <p className="text-xs text-gray-300 mt-0.5">
                                            {selectedUnits.length} unit · {fmt(rawDealPrice)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
                                {/* Total */}
                                <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex justify-between items-center">
                                    <div>
                                        <p className="text-xs text-gray-500 font-medium">Total Pembayaran</p>
                                        <p className="text-xl font-black text-gray-800 mt-0.5">{fmt(rawDealPrice)}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full border border-gray-200">
                                            {paymentMethod === "TF_CASH" ? `TF ${fmt(splitTF)} + Cash ${fmt(splitCash)}` : paymentMethod}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-2.5 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                                    <ConfirmRow icon="👤" label="Pembeli" value={watch("customer_name") || "—"} />
                                    <ConfirmRow icon="📱" label="WhatsApp" value={watch("customer_phone") || "—"} />
                                    <div className="h-px bg-gray-200" />

                                    {/* Unit list */}
                                    <div>
                                        <p className="text-xs text-gray-400 mb-1.5">💻 Unit ({selectedUnits.length})</p>
                                        {selectedUnits.map((u, i) => (
                                            <div key={u.unit_id} className="flex justify-between text-xs mb-1">
                                                <span className="text-gray-600 truncate max-w-[45%]">{i + 1}. {u.laptop_name}</span>
                                                <span className="font-mono text-gray-700 font-semibold">{fmt(unitPrices[u.unit_id] || 0)}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Trade-in */}
                                    {isTradeIn && tradeInValue > 0 && (
                                        <>
                                            <div className="h-px bg-gray-200" />
                                            <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 space-y-1">
                                                <p className="text-[10px] font-bold text-amber-700">🔁 Tukar Tambah</p>
                                                <ConfirmRow icon="📦" label="Barang" value={tradeInItem} />
                                                <ConfirmRow icon="💰" label="Nilai" value={fmt(tradeInValue)} />
                                                <ConfirmRow icon="💵" label="Cash terima" value={fmt(Math.max(0, rawDealPrice - tradeInValue))} bold />
                                            </div>
                                        </>
                                    )}

                                    <div className="h-px bg-gray-200" />
                                    <ConfirmRow icon="📦" label="Pickup" value={watch("pickup_method") === "DATANG" ? "Datang ke Toko" : "Diantar"} />
                                    <ConfirmRow icon="🛡️" label="Garansi" value={`${warrantyDuration} hari`} />
                                    {isEcommerce && (
                                        <ConfirmRow icon="📦" label="Platform" value={ecommercePlatform} />
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
                                <button type="button" onClick={() => setShowConfirmModal(false)}
                                    className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">
                                    Periksa Lagi
                                </button>
                                <button type="button" onClick={handleConfirmedSubmit} disabled={submitting}
                                    className="flex-1 h-11 bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm">
                                    {submitting ? (
                                        <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>
                                    ) : (
                                        <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Ya, Simpan</>
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