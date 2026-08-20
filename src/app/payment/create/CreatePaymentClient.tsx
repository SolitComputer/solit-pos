"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { User, RefreshCw, Handshake, Hand, Tag, Repeat, Gift, Store, Package, Banknote, Landmark, QrCode, Shuffle, Check, Shield, Smartphone, Cake, Wallet, Laptop, X, AlertTriangle, CheckCircle2, History, ScanLine, MapPin, Search, Minus, Plus, ChevronLeft, ChevronRight, Save, Loader2, Receipt, CalendarDays, Camera } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createPaymentSchema, CreatePaymentType, UnitItem } from "@/lib/validation";
import { supabase } from "@/services/supabase";
import imageCompression from "browser-image-compression";
import { useSearchParams } from "next/navigation";
import { UserRole, PERMISSIONS, hasPermission, ACCESSORY_ONLY_SALES_ROLES } from "@/lib/permissions";
import { getAuthUser } from "@/hooks/useAuthUser";

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
    charger_price?: number;
    laptop_bag_price?: number; grade: "A" | "B" | "C" | null;
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
    icon: ReactNode; label: string; value: string; bold?: boolean; mono?: boolean;
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
                className="ml-2 w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition flex-shrink-0"
            >
                <X size={15} />
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
    const [prepResolveError, setPrepResolveError] = useState<string | null>(null);

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

    const [pedagangPriceMap, setPedagangPriceMap] = useState<Record<string, number>>({});

    // ── Trade-in ──────────────────────────────────────────────────────────────
    const [isTradeIn, setIsTradeIn] = useState(false);
    const [tradeInItem, setTradeInItem] = useState("");
    const [tradeInValue, setTradeInValue] = useState<number>(0);
    const [tradeInCash, setTradeInCash] = useState<number>(0);

    // ── Aksesori (quantity-based, tanpa SN) ─────────────────────────────────
    interface AccessoryOption {
        id: string; name: string; category: string;
        brand?: string; spec?: string; sell_price: number; stock: number;
    }
    interface SelectedAccessory {
        accessory_id: string; name: string; category: string;
        sell_price: number; stock: number;
        quantity: number; unit_price: number; is_bonus: boolean;
    }
    const [selectedAccessories, setSelectedAccessories] = useState<SelectedAccessory[]>([]);
    const [accSearch, setAccSearch] = useState("");
    const [accResults, setAccResults] = useState<AccessoryOption[]>([]);
    const [accLoading, setAccLoading] = useState(false);

    // ── E-commerce ────────────────────────────────────────────────────────────
    const [isEcommerce, setIsEcommerce] = useState(false);
    const [ecommercePlatform, setEcommercePlatform] = useState<"SHOPEE" | "TOKOPEDIA" | "TIKTOK" | "LAZADA" | "">("");
    const [ecommerceOrderId, setEcommerceOrderId] = useState("");

    const [customerType, setCustomerType] = useState<"UMUM" | "RESELLER" | "MITRA">("UMUM");

    const [sellerType, setSellerType] = useState<"USER" | "PEDAGANG">("USER");
    const [customerBirthDate, setCustomerBirthDate] = useState("");

    const [paymentFlow, setPaymentFlow] = useState<"PENDING" | "DIRECT" | null>(null);
    const [pendingSubType, setPendingSubType] = useState<"ECOMMERCE" | "DP_AMBIL" | null>(null);
    const [dpAmount, setDpAmount] = useState<number>(0); // 0 = Ambil Dulu, >0 = DP

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
        if (fromScan || fromPrep) {
            setPaymentFlow("DIRECT");
            setIsEcommerce(false);
        }
    }, [fromScan, fromPrep]);

    useEffect(() => {
        setValue("is_ecommerce", isEcommerce);
        setValue("ecommerce_platform", isEcommerce ? ecommercePlatform : undefined);
        setValue("ecommerce_order_id", isEcommerce ? ecommerceOrderId : undefined);
    }, [isEcommerce, ecommercePlatform, ecommerceOrderId, setValue]);

    useEffect(() => {
        getAuthUser().then(u => ({ success: true, user: u }))
            .then(r => setUserRole(r.user?.role ?? null))
            .catch(() => setUserRole(null));
    }, []);

    const canSeeMargin = userRole
        ? hasPermission(userRole, ["ADMIN", "KEPALA_SALES", "ACCOUNTING", "PENGELOLA_BARANG"])
        : false;
    const isAccessoryOnlyRole = userRole ? ACCESSORY_ONLY_SALES_ROLES.includes(userRole) : false;

    // ── Fetch price list pedagang saat sellerType = PEDAGANG ──────────────────
    useEffect(() => {
        if (sellerType !== "PEDAGANG") return;
        const loadPedagangPrices = async () => {
            try {
                const res = await fetch("/api/price-list-pedagang");
                const result = await res.json();
                if (result.success) {
                    const map: Record<string, number> = {};
                    (result.data || []).forEach((row: any) => {
                        map[row.unit_id] = row.pedagang_price;
                    });
                    setPedagangPriceMap(map);
                }
            } catch {
                /* biarkan harga manual kalau fetch gagal */
            }
        };
        loadPedagangPrices();
    }, [sellerType]);

    useEffect(() => {
        if (sellerType !== "PEDAGANG") return;
        setUnitPrices(prev => {
            const next = { ...prev };
            let changed = false;
            selectedUnits.forEach(u => {
                const pedagangPrice = pedagangPriceMap[u.unit_id];
                if (pedagangPrice !== undefined && !prev[u.unit_id]) {
                    next[u.unit_id] = pedagangPrice;
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [sellerType, selectedUnits, pedagangPriceMap]);

    useEffect(() => {
        const laptopTotal = selectedUnits.reduce((sum, u) => sum + (unitPrices[u.unit_id] || 0), 0);
        const accTotal = selectedAccessories.reduce(
            (sum, a) => sum + (a.is_bonus ? 0 : a.unit_price * a.quantity), 0
        );
        const total = laptopTotal + accTotal;
        setRawDealPrice(total);
        setValue("amount", total);
    }, [unitPrices, selectedUnits, selectedAccessories, setValue]);

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
        if (draft._customerBirthDate) setCustomerBirthDate(draft._customerBirthDate);


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
            _customerBirthDate: customerBirthDate,
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

                if (resolved.length < items.length) {
                    const failedSNs = items
                        .filter((it) => !resolved.some((r) => r.serial_number === it.serial_number))
                        .map((it) => it.serial_number)
                        .join(", ");
                    console.error("[loadPrep] Unit gagal di-resolve via check-sn:", failedSNs);
                    setPrepResolveError(
                        resolved.length === 0
                            ? `Semua unit gagal dimuat (SN: ${failedSNs}). Kemungkinan status unit sudah berubah dari SIAP_JUAL, sehingga tidak lolos pengecekan ketersediaan di /api/units/check-sn.`
                            : `${items.length - resolved.length} dari ${items.length} unit gagal dimuat (SN: ${failedSNs}).`
                    );
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

    const handleAccSearch = useCallback(async (q: string) => {
        if (q.length < 2) { setAccResults([]); return; }
        setAccLoading(true);
        try {
            const res = await fetch(`/api/accessories/search?q=${encodeURIComponent(q)}`);
            const result = await res.json();
            if (!res.ok || !result.success) {
                console.error("[handleAccSearch] gagal ambil data aksesori:", result.error || res.statusText);
                setAccResults([]);
                return;
            }
            const selectedIds = new Set(selectedAccessories.map(a => a.accessory_id));
            setAccResults((result.data || []).filter((a: AccessoryOption) => !selectedIds.has(a.id)));
        } catch (err) {
            console.error("[handleAccSearch] error:", err);
            setAccResults([]);
        } finally { setAccLoading(false); }
    }, [selectedAccessories]);

    const handleAddAccessory = (a: AccessoryOption) => {
        setSelectedAccessories(prev => [...prev, {
            accessory_id: a.id, name: a.name, category: a.category,
            sell_price: a.sell_price, stock: a.stock,
            quantity: 1, unit_price: a.sell_price, is_bonus: false,
        }]);
        setAccSearch(""); setAccResults([]);
    };
    const updateAccessory = (idx: number, patch: Partial<SelectedAccessory>) =>
        setSelectedAccessories(prev => prev.map((a, i) => i === idx ? { ...a, ...patch } : a));
    const removeAccessory = (idx: number) =>
        setSelectedAccessories(prev => prev.filter((_, i) => i !== idx));

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
        if (paymentFlow === "DIRECT" && !customerBirthDate) {
            alert("Tanggal lahir customer wajib diisi");
            setStep(1);
            return;
        }
        const paidAcc = selectedAccessories.filter(a => !a.is_bonus).length;
        if (!selectedUnits.length && selectedAccessories.length === 0) {
            alert("Pilih minimal 1 unit atau aksesori"); return;
        }
        // Aksesori bonus tanpa laptop = transaksi Rp0 → tolak
        if (!selectedUnits.length && paidAcc === 0) {
            alert("Transaksi hanya berisi bonus. Tambahkan laptop atau aksesori berbayar."); return;
        }

        if (!rawDealPrice || rawDealPrice < 1000) {
            alert("Harga deal minimal Rp1.000");
            return;
        }

       if (paymentFlow === "DIRECT" && !paymentPhoto) { alert("Foto pembayaran wajib diupload"); return; }
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

    // Dipanggil react-hook-form kalau zodResolver gagal validasi.
    // Sebelumnya tidak ada handler ini → kegagalan validasi senyap total,
    // modal konfirmasi tidak muncul dan tidak ada pesan apapun ke user.
    const onInvalidSubmit = (errs: Record<string, any>) => {
        const fieldErrors = Object.entries(errs).map(
            ([field, err]) => `${field}: ${(err as any)?.message ?? "tidak valid"}`
        );
        console.error("[CreatePayment] Validasi form gagal:", fieldErrors);
        const firstKey = Object.keys(errs)[0];
        const firstMsg = firstKey
            ? (errs[firstKey]?.message || `Field "${firstKey}" tidak valid`)
            : "Form tidak valid";
        alert(`Tidak bisa lanjut — ${firstMsg}\n\n(Cek Console untuk detail lengkap semua field yang error)\n\n${fieldErrors.join("\n")}`);
    };

   const handleConfirmedSubmit = async () => {
        if (!pendingSubmitData) return;
        setShowConfirmModal(false);
        setSubmitting(true);
        try {
            // Upload foto — opsional untuk Payment Pending, wajib sudah divalidasi
            // di onSubmit untuk Payment Transaksi (DIRECT)
            let photoUrl: string | null = null;
            if (paymentPhoto) {
                const fileName = `${Date.now()}-${paymentPhoto.name}`;
                const { error: uploadError } = await supabase.storage
                    .from("payment-proof")
                    .upload(fileName, paymentPhoto);
                if (uploadError) { alert("Upload foto gagal"); return; }

                const { data: imageData } = supabase.storage
                    .from("payment-proof")
                    .getPublicUrl(fileName);
                photoUrl = imageData.publicUrl;
            }

            const res = await fetch("/api/transaction/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...pendingSubmitData,
                    payment_photo: photoUrl,
                    latitude, longitude,
                    warranty_duration: warrantyDuration,
                    seller_type: sellerType,
                    payment_mode: paymentFlow === "PENDING" ? "PENDING" : "DIRECT",
                    dp_amount: pendingSubType === "DP_AMBIL" ? dpAmount : 0,
                    dp_status: pendingSubType === "DP_AMBIL" ? (dpAmount > 0 ? "RESERVED" : "HELD") : undefined,
                    is_ecommerce: isEcommerce,
                    ecommerce_platform: isEcommerce ? ecommercePlatform : null,
                    ecommerce_order_id: isEcommerce ? ecommerceOrderId : null,
                    unit_prices: selectedUnits.map(u => ({
                        unit_id: u.unit_id,
                        deal_price: unitPrices[u.unit_id] || 0,
                    })),
                    accessories: selectedAccessories.map(a => ({
                        accessory_id: a.accessory_id,
                        name: a.name,
                        quantity: a.quantity,
                        unit_price: a.is_bonus ? 0 : a.unit_price,
                        is_bonus: a.is_bonus,
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

    const inputClass = "border border-gray-200 rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 bg-white w-full transition-all duration-200";
    const selectClass = "border border-gray-200 rounded-xl h-11 px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 w-full transition-all duration-200";
    const btnSecondary = "flex-1 bg-white text-gray-600 border border-gray-200 rounded-xl h-11 font-medium hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98] transition-all duration-200 text-sm";
    const btnPrimary = "flex-1 bg-gray-700 text-white rounded-xl h-11 font-medium hover:bg-gray-800 active:scale-[0.98] transition-all duration-200 text-sm shadow-sm";
    const hasPedagangPrice = (unitId: string) => sellerType === "PEDAGANG" && pedagangPriceMap[unitId] !== undefined;
    const stepLabels = ["Data Pembeli", "Pilih Unit", "Pengambilan", "Pembayaran"];
    const stepIcons = [User, Laptop, CalendarDays, Wallet];
    const goBack3 = () => fromScan ? setStep(1) : setStep(2);

    return (
        <div className="max-w-lg mx-auto px-4 py-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all duration-300">

                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Receipt size={18} className="text-white" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold bg-gradient-to-r from-gray-800 to-gray-900 bg-clip-text text-transparent leading-tight">
                            Buat Payment
                        </h1>
                        <p className="text-xs text-gray-400">{stepLabels[step - 1]}</p>
                    </div>
                </div>

                {/* Step indicator */}
                <div className="flex items-center mb-6">
                    {stepIcons.map((StepIcon, idx) => {
                        const i = idx + 1;
                        const isDone = step > i;
                        const isActive = step === i;
                        return (
                            <div key={i} className={`flex items-center ${i < stepIcons.length ? "flex-1" : ""}`}>
                                <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 flex-shrink-0 ${isDone
                                        ? "bg-gray-700 border-gray-700 text-white"
                                        : isActive
                                            ? "bg-white border-gray-600 text-gray-700 ring-4 ring-gray-100"
                                            : "bg-white border-gray-200 text-gray-300"
                                        }`}
                                >
                                    {isDone ? <Check size={14} /> : <StepIcon size={14} />}
                                </div>
                                {i < stepIcons.length && (
                                    <div className={`flex-1 h-0.5 mx-1.5 rounded-full transition-all duration-300 ${step > i ? "bg-gray-700" : "bg-gray-200"}`} />
                                )}
                            </div>
                        );
                    })}
                </div>

                {fromPrep && (
                    <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 mb-4">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                            <CheckCircle2 size={16} className="text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-emerald-700">
                                {prepLoading ? "Memuat data penyiapan..." : "Data dari penyiapan barang"}
                            </p>
                            {prepOrderNumber && <p className="text-xs text-emerald-600 font-mono">{prepOrderNumber}</p>}
                        </div>
                    </div>
                )}

                {fromPrep && prepResolveError && (
                    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
                        <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700">{prepResolveError}</p>
                    </div>
                )}
                {/* Scan banner */}
                {fromScan && (
                    <div className="flex items-center gap-3 bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 mb-4">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                            <ScanLine size={16} className="text-gray-600" />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-700">Unit dari scan barcode</p>
                            <p className="text-xs text-gray-500 font-mono">{urlSn}</p>
                        </div>
                    </div>
                )}

                {draftRestored && !fromScan && (
                    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                                <History size={16} className="text-gray-600" />
                            </div>
                            <p className="text-xs font-semibold text-gray-700">Draft tersimpan dipulihkan</p>
                        </div>
                        <button type="button" onClick={() => { clearDraft(); window.location.reload(); }}
                            className="text-xs text-gray-500 hover:text-gray-700 transition underline">
                            Mulai baru
                        </button>
                    </div>
                )}

                <form onSubmit={handleSubmit(onSubmit, onInvalidSubmit)} className="space-y-3">
                    <input type="hidden" {...register("laptop_id")} />
                    <input type="hidden" {...register("laptop_name")} />
                    <input type="hidden" {...register("serial_number")} />
                    <input type="hidden" {...register("unit_id" as any)} />
                    <input type="hidden" {...register("customer_type")} />

                    {!paymentFlow && (
                        <div className="space-y-3">
                            <p className="text-xs text-gray-500 text-center">Pilih jenis payment</p>
                            <button type="button" onClick={() => { setPaymentFlow("DIRECT"); setPendingSubType(null); setIsEcommerce(false); setDpAmount(0); }}
                                className="w-full p-4 rounded-xl border border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition text-left">
                                <p className="text-sm font-bold text-gray-800">Payment Transaksi</p>
                                <p className="text-xs text-gray-400 mt-0.5">Langsung lunas, tanpa pending</p>
                            </button>
                            <button type="button" onClick={() => { setPaymentFlow("PENDING"); setPendingSubType("ECOMMERCE"); setIsEcommerce(true); }}
                                className="w-full p-4 rounded-xl border border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition text-left">
                                <p className="text-sm font-bold text-gray-800">Payment Pending</p>
                                <p className="text-xs text-gray-400 mt-0.5">Default E-Commerce — bisa diganti ke DP/Ambil Dulu di dalam form</p>
                            </button>
                        </div>
                    )}

                    {paymentFlow === "PENDING" && (
                        <div className="flex gap-2 mb-3">
                            <button type="button" onClick={() => { setPendingSubType("ECOMMERCE"); setIsEcommerce(true); }}
                                className={`flex-1 h-9 rounded-lg text-xs font-semibold border transition ${pendingSubType === "ECOMMERCE" ? "bg-sky-600 text-white border-sky-600" : "bg-white text-gray-500 border-gray-200"}`}>
                                E-Commerce
                            </button>
                            <button type="button" onClick={() => { setPendingSubType("DP_AMBIL"); setIsEcommerce(false); setDpAmount(0); }}
                                className={`flex-1 h-9 rounded-lg text-xs font-semibold border transition ${pendingSubType === "DP_AMBIL" ? "bg-violet-600 text-white border-violet-600" : "bg-white text-gray-500 border-gray-200"}`}>
                                DP / Ambil Dulu
                            </button>
                        </div>
                    )}

                    {!fromScan && !fromPrep && paymentFlow && (
                        <button
                            type="button"
                            onClick={() => {
                                setPaymentFlow(null);
                                setPendingSubType(null);
                                setIsEcommerce(false);
                                setDpAmount(0);
                                setStep(1);
                            }}
                            className="text-xs text-gray-400 hover:text-gray-600 inline-flex items-center gap-1 -mt-1 mb-1"
                        >
                            <ChevronLeft size={14} /> Ganti Jenis Paymentt
                        </button>
                    )}

                    {/* ──────────────────────── STEP 1: Data Pembeli ─────────────────── */}
                    {step === 1 && (paymentFlow === "DIRECT" || pendingSubType) && (
                        <>
                            <input type="text" placeholder="Atas Nama *" className={inputClass} {...register("customer_name")} />
                          <div>
                                <label className="text-xs text-gray-500 mb-1.5 block">
                                    Tanggal Lahir Customer {paymentFlow === "DIRECT" ? "*" : <span className="text-gray-400 font-normal">(opsional)</span>}
                                </label>
                                <input type="date" className={inputClass}
                                    value={customerBirthDate}
                                    onChange={e => setCustomerBirthDate(e.target.value)} />
                            </div>

                            <div>
                                <label className="text-xs text-gray-500 mb-1.5 block">Tipe Customer *</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { value: "UMUM", label: "Umum", icon: <User size={20} />, desc: "Pembeli biasa" },
                                        { value: "RESELLER", label: "Reseller", icon: <RefreshCw size={20} />, desc: "Jual kembali" },
                                        { value: "MITRA", label: "Mitra", icon: <Handshake size={20} />, desc: "Mitra bisnis" },
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
                                        { value: "USER", label: "User", icon: <Hand size={20} />, desc: "Follow-up 7 hari" },
                                        { value: "PEDAGANG", label: "Pedagang", icon: <Tag size={20} />, desc: "Follow-up 3 hari" },
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

                            <input type="text" placeholder="Nama Perusahaan" className={inputClass} {...register("company_name")} />
                            <input
                                type="tel"
                                placeholder={isEcommerce ? "No. WhatsApp (opsional untuk E-Commerce)" : "No. WhatsApp *"}
                                className={inputClass}
                                {...register("customer_phone")}
                            />
                            <div>
                                <label className="text-xs text-gray-500 mb-1.5 block">Tahu Solit dari mana?</label>
                                <select className={selectClass} {...register("source_platform")}>
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
                                if (!isEcommerce && !watch("customer_phone")) { alert("Isi nomor WhatsApp dulu"); return; }
                                if (paymentFlow === "DIRECT" && !customerBirthDate) { alert("Isi tanggal lahir customer dulu"); return; }
                                fromScan ? setStep(3) : setStep(2);
                            }} className={`w-full ${btnPrimary} inline-flex items-center justify-center gap-1.5`}>
                                Lanjut <ChevronRight size={16} />
                            </button>
                        </>
                    )}

                    {/* ──────────────────────── STEP 2: Pilih Unit ───────────────────── */}
                    {step === 2 && !fromScan && (
                        <>
                            {!isAccessoryOnlyRole && (
                                <>
                                    {/* Search SN */}
                                    <div>
                                        <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                                            <Laptop size={13} /> Cari & Tambah Serial Number
                                            {selectedUnits.length > 0 && (
                                                <span className="text-gray-700 font-semibold">({selectedUnits.length} unit terpilih)</span>
                                            )}
                                        </label>
                                        <div className="relative">
                                            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                            <input
                                                type="text"
                                                placeholder="Ketik SN unit..."
                                                className={`${inputClass} pl-10`}
                                                value={snSearch}
                                                onChange={e => { setSnSearch(e.target.value); handleSnSearch(e.target.value); }}
                                            />
                                            {isLoadingUnits && (
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                    <Loader2 size={16} className="text-gray-400 animate-spin" />
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
                                                        {hasPedagangPrice(u.unit_id) && (
                                                            <p className="text-[10px] text-emerald-600 font-medium ml-5.5">Harga mengikuti price list pedagang — masih bisa diubah manual</p>
                                                        )}
                                                        <input
                                                            key={`${u.unit_id}-${pedagangPriceMap[u.unit_id] ?? "none"}`}
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

                                                {pendingSubType === "DP_AMBIL" && (
                                                    <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 space-y-1.5 mt-2">
                                                        <label className="text-xs font-semibold text-violet-700 block">
                                                            Nominal DP <span className="text-violet-400 font-normal">(isi 0 = Ambil Dulu)</span>
                                                        </label>
                                                        <input
                                                            type="text" inputMode="numeric"
                                                            value={dpAmount > 0 ? dpAmount.toLocaleString("id-ID") : ""}
                                                            placeholder="0"
                                                            onChange={e => {
                                                                const raw = e.target.value.replace(/\D/g, "");
                                                                const num = raw ? Number(raw) : 0;
                                                                setDpAmount(Math.min(num, Math.max(0, rawDealPrice - 1)));
                                                            }}
                                                            className={inputClass}
                                                        />
                                                        <p className="text-[11px] text-violet-500">
                                                            {dpAmount > 0
                                                                ? `Sisa setelah DP: ${fmt(Math.max(0, rawDealPrice - dpAmount))}`
                                                                : "Status: Ambil Dulu (belum ada pembayaran)"}
                                                        </p>
                                                    </div>
                                                )}

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
                                                        <Repeat size={16} />
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

                                </>
                            )}

                            {/* ── Aksesori (opsional, tanpa SN) ── */}
                            <div>
                                <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                                    <Gift size={13} /> Aksesori (opsional)
                                    {selectedAccessories.length > 0 && (
                                        <span className="text-gray-700 font-semibold">({selectedAccessories.length} item)</span>
                                    )}
                                </label>
                                <div className="relative">
                                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    <input type="text" placeholder="Cari aksesori (nama/kategori)..." className={`${inputClass} pl-10`}
                                        value={accSearch}
                                        onChange={e => { setAccSearch(e.target.value); handleAccSearch(e.target.value); }} />
                                    {accLoading && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            <Loader2 size={16} className="text-gray-400 animate-spin" />
                                        </div>
                                    )}
                                </div>

                                {accResults.length > 0 && (
                                    <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
                                        {accResults.map(a => (
                                            <button key={a.id} type="button" onClick={() => handleAddAccessory(a)}
                                                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition border-b border-gray-100 last:border-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-semibold text-gray-800">{a.name}</p>
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-600">{a.category}</span>
                                                </div>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    Stok: {a.stock} · {fmt(a.sell_price)}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {accSearch.length >= 2 && accResults.length === 0 && !accLoading && (
                                    <p className="text-xs text-gray-400 mt-1.5 px-1">Aksesori tidak ditemukan / stok habis</p>
                                )}
                            </div>

                            {selectedAccessories.length > 0 && (
                                <div className="space-y-2">
                                    {selectedAccessories.map((a, i) => (
                                        <div key={a.accessory_id} className="bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-semibold text-gray-800 truncate">{a.name}</p>
                                                    <p className="text-[10px] text-gray-400">Stok tersedia: {a.stock}</p>
                                                </div>
                                                <button type="button" onClick={() => removeAccessory(i)} className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition flex-shrink-0">
                                                    <X size={15} />
                                                </button>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {/* Qty */}
                                                <div className="flex items-center border border-gray-200 rounded-lg bg-white">
                                                    <button type="button" onClick={() => updateAccessory(i, { quantity: Math.max(1, a.quantity - 1) })}
                                                        className="w-8 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-50 rounded-l-lg"><Minus size={13} /></button>
                                                    <span className="w-8 text-center text-sm font-semibold text-gray-800">{a.quantity}</span>
                                                    <button type="button" onClick={() => updateAccessory(i, { quantity: Math.min(a.stock, a.quantity + 1) })}
                                                        className="w-8 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-50 rounded-r-lg"><Plus size={13} /></button>
                                                </div>

                                                {/* Toggle Bonus */}
                                                <button type="button" onClick={() => updateAccessory(i, { is_bonus: !a.is_bonus })}
                                                    className={`h-9 px-3 rounded-lg text-xs font-semibold border transition inline-flex items-center gap-1 ${a.is_bonus ? "bg-amber-500 text-white border-amber-500" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                                                    <Gift size={14} /> Bonus
                                                </button>

                                                {/* Harga (disembunyikan kalau bonus) */}
                                                {!a.is_bonus && (
                                                    <input type="text" inputMode="numeric" className={`${inputClass} flex-1`}
                                                        defaultValue={a.unit_price ? a.unit_price.toLocaleString("id-ID") : ""}
                                                        onChange={e => {
                                                            const raw = e.target.value.replace(/\D/g, "");
                                                            updateAccessory(i, { unit_price: raw ? Number(raw) : 0 });
                                                        }}
                                                        onBlur={e => { const raw = e.target.value.replace(/\D/g, ""); if (raw) e.target.value = Number(raw).toLocaleString("id-ID"); }}
                                                        onFocus={e => { e.target.value = e.target.value.replace(/\D/g, ""); }} />
                                                )}
                                            </div>

                                            <div className="flex justify-between text-[11px] pt-1 border-t border-gray-200">
                                                <span className="text-gray-400">Subtotal</span>
                                                <span className={`font-semibold ${a.is_bonus ? "text-amber-600" : "text-gray-700"}`}>
                                                    {a.is_bonus ? "GRATIS (bonus)" : fmt(a.unit_price * a.quantity)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}

                                    {!selectedUnits.length && (
                                        <div className="flex justify-between text-xs border-t border-gray-200 pt-2 px-1">
                                            <span className="text-gray-600 font-semibold">Total ({selectedAccessories.length} item)</span>
                                            <span className="font-bold text-gray-800 font-mono">{fmt(rawDealPrice)}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            <input type="text" placeholder="Request Software (opsional)" className={inputClass} {...register("software_request")} />

                            <div className="flex gap-2 pt-1">
                                <button type="button" onClick={() => setStep(1)} className={`${btnSecondary} inline-flex items-center justify-center gap-1.5`}><ChevronLeft size={16} /> Kembali</button>
                                <button type="button" onClick={() => {
                                    const paidAcc = selectedAccessories.filter(a => !a.is_bonus).length;
                                    if (!selectedUnits.length && selectedAccessories.length === 0) { alert("Pilih minimal 1 unit atau aksesori dulu"); return; }
                                    if (!selectedUnits.length && paidAcc === 0) { alert("Transaksi hanya berisi bonus. Tambahkan unit atau aksesori berbayar."); return; }
                                    if (!rawDealPrice) { alert("Masukkan harga deal"); return; }
                                    if (isTradeIn && !tradeInItem) { alert("Isi nama barang tukar"); return; }
                                    if (isTradeIn && !tradeInValue) { alert("Isi nilai barang tukar"); return; }
                                    setStep(3);
                                }} className={`${btnPrimary} inline-flex items-center justify-center gap-1.5`}>
                                    Lanjut <ChevronRight size={16} />
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
                                            {hasPedagangPrice(u.unit_id) && (
                                                <p className="text-[10px] text-emerald-600 font-medium">Harga mengikuti price list pedagang — masih bisa diubah manual</p>
                                            )}
                                            <input
                                                key={`${u.unit_id}-${pedagangPriceMap[u.unit_id] ?? "none"}`}
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
                                <button type="button" onClick={goBack3} className={`${btnSecondary} inline-flex items-center justify-center gap-1.5`}><ChevronLeft size={16} /> Kembali</button>
                                <button type="button" onClick={() => {
                                    if (fromScan && !rawDealPrice) { alert("Masukkan harga deal dulu"); return; }
                                    setStep(4);
                                }} className={`${btnPrimary} inline-flex items-center justify-center gap-1.5`}>
                                    Lanjut <ChevronRight size={16} />
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
                                        <Store size={16} /> Offline / Langsung
                                    </button>
                                    <button type="button" onClick={() => setIsEcommerce(true)}
                                        className={`flex items-center justify-center gap-2 h-11 rounded-xl border text-sm font-medium transition ${isEcommerce ? "bg-gray-600 text-white border-gray-600 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                            }`}>
                                        <Package size={16} /> E-Commerce
                                    </button>
                                </div>
                            </div>

                            {isEcommerce && (
                                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                                    <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5"><Package size={14} /> Status PACKING sampai dana cair</p>
                                    <div>
                                        <label className="text-xs text-gray-500 mb-1.5 block">Platform *</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {(["SHOPEE", "TOKOPEDIA", "TIKTOK", "LAZADA"] as const).map(p => (
                                                <button key={p} type="button" onClick={() => setEcommercePlatform(p)}
                                                    className={`h-10 rounded-xl border text-xs font-semibold transition ${ecommercePlatform === p ? "bg-gray-600 text-white border-gray-600 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                                        }`}>
                                                    {p === "SHOPEE" ? "Shopee" : p === "TOKOPEDIA" ? "Tokopedia" : p === "TIKTOK" ? "TikTok" : "Lazada"}
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
                                        { value: "CASH", label: "Cash", icon: <Banknote size={18} />, desc: "Uang tunai" },
                                        { value: "TRANSFER", label: "Transfer", icon: <Landmark size={18} />, desc: "Transfer bank" },
                                        { value: "QRIS", label: "QRIS", icon: <QrCode size={18} />, desc: "QR Code" },
                                        { value: "TF_CASH", label: "TF + Cash", icon: <Shuffle size={18} />, desc: "Sebagian TF, sebagian tunai" },
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
                                            <span className="leading-none">{m.icon}</span>
                                            <span className="text-xs">{m.label}</span>
                                            <span className={`text-[9px] ${paymentMethod === m.value ? "text-gray-300" : "text-gray-400"}`}>{m.desc}</span>
                                        </button>
                                    ))}
                                </div>

                                {/* Split TF + Cash form */}
                                {paymentMethod === "TF_CASH" && rawDealPrice > 0 && (
                                    <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-3">
                                        <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                                            <Shuffle size={14} /> Rincian Pembayaran — Total: <span className="font-bold">{fmt(rawDealPrice)}</span>
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
                                                <span>{splitTF + splitCash === rawDealPrice ? <span className="inline-flex items-center gap-0.5"><Check size={12} /> Sesuai</span> : `Kurang/Lebih ${fmt(Math.abs(rawDealPrice - splitTF - splitCash))}`}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {!isAccessoryOnlyRole && (
                                <>
                                    {/* Garansi */}
                                    <div>
                                        <label className="text-xs text-gray-500 mb-1.5 block flex items-center gap-1.5">
                                            <Shield size={14} /> Durasi Garansi
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

                                </>
                            )}

                            {/* Foto */}
                           <div>
                                <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
                                    <Camera size={14} /> Foto Bukti Pembayaran {paymentFlow === "DIRECT" ? "*" : <span className="text-gray-400 font-normal">(opsional)</span>}
                                </label>
                                <input type="file" accept="image/*" capture="environment"
                                    className="border border-gray-200 rounded-xl p-3 text-sm w-full bg-white file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 transition"
                                    onChange={handlePhotoChange}
                                />
                                {paymentPhoto && <p className="text-xs text-gray-600 mt-1 inline-flex items-center gap-1"><Check size={12} /> {paymentPhoto.name}</p>}
                            </div>

                            {/* GPS */}
                            <div className="border border-gray-200 rounded-xl p-4 flex justify-between items-center gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                                        <MapPin size={16} className="text-gray-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-800">GPS Lokasi</p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {latitude ? <span className="inline-flex items-center gap-1"><Check size={12} /> Koordinat berhasil diambil</span> : "Wajib diambil sebelum simpan"}
                                        </p>
                                    </div>
                                </div>
                                <button type="button" onClick={getLocation}
                                    className={`px-4 py-2 rounded-xl text-sm font-medium transition active:scale-95 flex-shrink-0 inline-flex items-center gap-1.5 ${latitude ? "bg-gray-100 text-gray-700 border border-gray-200" : "bg-gray-700 text-white hover:bg-gray-800"
                                        }`}>
                                    {gpsLoading ? <Loader2 size={14} className="animate-spin" /> : latitude ? <Check size={14} /> : <MapPin size={14} />}
                                    {gpsLoading ? "Mencari..." : latitude ? "Diambil" : "Ambil GPS"}
                                </button>
                            </div>

                            <input type="text" placeholder="Catatan (opsional)" className={inputClass} {...register("notes")} />

                            <div className="flex gap-2 pt-1">
                                <button type="button" onClick={() => setStep(3)} className={`${btnSecondary} inline-flex items-center justify-center gap-1.5`}><ChevronLeft size={16} /> Kembali</button>
                                <button
                                    type="button"
                                    disabled={submitting}
                                    onClick={() => {
                                        setValue("units", selectedUnits);
                                        setValue("amount", rawDealPrice);
                                        handleSubmit(onSubmit, onInvalidSubmit)();
                                    }}
                                    className={`${btnPrimary} disabled:opacity-50 inline-flex items-center justify-center gap-1.5`}
                                >
                                    {submitting ? <><Loader2 size={16} className="animate-spin" /> Menyimpan...</> : <><Save size={16} /> Simpan Transaksi</>}
                                </button>
                            </div>
                        </>
                    )}
                </form>

                {/* ── Modal Konfirmasi ── */}
                {showConfirmModal && (selectedUnits.length > 0 || selectedAccessories.length > 0) && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
                        <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]">

                            <div className="bg-gray-700 px-5 py-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-gray-500 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <CheckCircle2 size={20} className="text-white" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-white text-sm">Konfirmasi Transaksi</p>
                                        <p className="text-xs text-gray-300 mt-0.5">
                                            {[
                                                selectedUnits.length > 0 ? `${selectedUnits.length} unit` : null,
                                                selectedAccessories.length > 0 ? `${selectedAccessories.length} aksesori` : null,
                                            ].filter(Boolean).join(" · ")} · {fmt(rawDealPrice)}
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
                                    <ConfirmRow icon={<User size={14} />} label="Pembeli" value={watch("customer_name") || "—"} />
                                    <ConfirmRow icon={<Smartphone size={14} />} label="WhatsApp" value={watch("customer_phone") || "—"} />
                                    {customerBirthDate && (
                                        <ConfirmRow icon={<Cake size={14} />} label="Tgl Lahir" value={new Date(customerBirthDate + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} />
                                    )}
                                    <div className="h-px bg-gray-200" />

                                    {/* Unit list */}
                                    {selectedUnits.length > 0 && (
                                        <div>
                                            <p className="text-xs text-gray-400 mb-1.5 inline-flex items-center gap-1"><Laptop size={12} /> Unit ({selectedUnits.length})</p>
                                            {selectedUnits.map((u, i) => (
                                                <div key={u.unit_id} className="flex justify-between text-xs mb-1">
                                                    <span className="text-gray-600 truncate max-w-[45%]">{i + 1}. {u.laptop_name}</span>
                                                    <span className="font-mono text-gray-700 font-semibold">{fmt(unitPrices[u.unit_id] || 0)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Aksesori list */}
                                    {selectedAccessories.length > 0 && (
                                        <div>
                                            <p className="text-xs text-gray-400 mb-1.5 inline-flex items-center gap-1"><Gift size={12} /> Aksesori ({selectedAccessories.length})</p>
                                            {selectedAccessories.map((a, i) => (
                                                <div key={a.accessory_id} className="flex justify-between text-xs mb-1">
                                                    <span className="text-gray-600 truncate max-w-[45%]">{i + 1}. {a.name}{a.quantity > 1 ? ` x${a.quantity}` : ""}</span>
                                                    <span className="font-mono text-gray-700 font-semibold">{a.is_bonus ? "GRATIS" : fmt(a.unit_price * a.quantity)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Trade-in */}
                                    {isTradeIn && tradeInValue > 0 && (
                                        <>
                                            <div className="h-px bg-gray-200" />
                                            <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 space-y-1">
                                                <p className="text-[10px] font-bold text-amber-700 inline-flex items-center gap-1"><Repeat size={11} /> Tukar Tambah</p>
                                                <ConfirmRow icon={<Package size={14} />} label="Barang" value={tradeInItem} />
                                                <ConfirmRow icon={<Wallet size={14} />} label="Nilai" value={fmt(tradeInValue)} />
                                                <ConfirmRow icon={<Banknote size={14} />} label="Cash terima" value={fmt(Math.max(0, rawDealPrice - tradeInValue))} bold />
                                            </div>
                                        </>
                                    )}

                                    <div className="h-px bg-gray-200" />
                                    <ConfirmRow icon={<Package size={14} />} label="Pickup" value={watch("pickup_method") === "DATANG" ? "Datang ke Toko" : "Diantar"} />
                                    <ConfirmRow icon={<Shield size={14} />} label="Garansi" value={`${warrantyDuration} hari`} />
                                    {isEcommerce && (
                                        <ConfirmRow icon={<Package size={14} />} label="Platform" value={ecommercePlatform} />
                                    )}
                                </div>

                                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                                    <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
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
                                        <><Loader2 size={16} className="animate-spin" />Menyimpan...</>
                                    ) : (
                                        <><Check size={16} />Ya, Simpan</>
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