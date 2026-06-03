"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LaptopUnit {
    id: string;
    laptop_id: string;
    serial_number: string;
    grade: "A" | "B" | "C";
    condition_note: string;
    purchase_price: number;
    selling_price: number;
    status: string;
    notes: string;
    created_at: string;
    reserved_by?: string;
    reserved_invoice?: string;
    laptop?: {
        id: string;
        laptop_name: string;
        brand: string;
        cpu: string;
        ram: string;
        storage: string;
        selling_price: number;
    };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

const GRADE_BADGE: Record<string, string> = {
    A: "bg-emerald-50 text-emerald-700 border-emerald-200",
    B: "bg-amber-50 text-amber-700 border-amber-200",
    C: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_CONFIG: Record<string, { badge: string; dot: string; label: string }> = {
    SIAP_JUAL: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Siap Jual" },
    RESERVED: { badge: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500", label: "Dipesan (DP)" },
    HELD: { badge: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500", label: "Diambil Dulu" },
    SOLD: { badge: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400", label: "Terjual" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function AlertModal({ message, onClose }: { message: string; onClose: () => void }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm font-medium mb-5">{message}</p>
                <button onClick={onClose} className="w-full h-10 bg-[#1a1a2e] text-white rounded-xl text-sm font-medium hover:bg-[#16213e] transition">OK</button>
            </div>
        </div>
    );
}

function ReserveModal({
    unit,
    type,
    salesName,
    onClose,
    onSuccess,
}: {
    unit: LaptopUnit;
    type: "RESERVED" | "HELD";
    salesName: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [form, setForm] = useState({
        customer_name: "",
        customer_phone: "",
        company_name: "Solit",   // ← auto-isi Solit
        dp_amount: "",        // ← kosong, tidak auto-fill
        deal_price: "",        // ← kosong, tidak auto-fill
        payment_method: "TRANSFER",
        source_platform: "",
        notes: "",
        software_request: "",
        pickup_method: "COD",
        pickup_date: "",
        pickup_time: "",
        pickup_location: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.customer_name.trim()) { setError("Nama pelanggan wajib diisi"); return; }
        if (isDP && !form.dp_amount) { setError("Jumlah DP wajib diisi"); return; }
        if (!form.deal_price) { setError("Harga deal wajib diisi"); return; }

        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/units/reserve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    unit_id: unit.id,
                    type,
                    customer_name: form.customer_name.trim(),
                    customer_phone: form.customer_phone.trim() || null,
                    company_name: form.company_name.trim() || null,
                    dp_amount: isDP ? Number(form.dp_amount) : undefined,
                    deal_price: Number(form.deal_price),
                    payment_method: form.payment_method,
                    source_platform: form.source_platform || null,
                    notes: form.notes || null,
                    sales_name: salesName,
                    software_request: form.software_request || null,
                    pickup_method: form.pickup_method || null,
                    pickup_date: form.pickup_date || null,
                    pickup_time: form.pickup_time || null,
                    pickup_location: form.pickup_location || null,
                }),
            });
            const result = await res.json();
            if (!result.success) { setError(result.message || "Gagal"); return; }
            onSuccess();
            onClose();
        } catch {
            setError("Terjadi kesalahan koneksi");
        } finally {
            setLoading(false);
        }
    };

    const isDP = type === "RESERVED";

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[94dvh] overflow-hidden">

                {/* ── Header ── */}
                <div className={`px-5 py-4 border-b flex-shrink-0 ${isDP
                    ? "border-violet-100 bg-gradient-to-r from-violet-50 to-purple-50"
                    : "border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50"
                    }`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${isDP ? "bg-violet-100" : "bg-orange-100"
                                }`}>
                                {isDP ? "🔒" : "📦"}
                            </div>
                            <div>
                                <h2 className="font-bold text-gray-800 text-base">
                                    {isDP ? "Pesanan DP" : "Ambil Dulu"}
                                </h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {isDP
                                        ? "Unit dikunci, pembayaran sebagian"
                                        : "Barang dibawa, pembayaran menyusul"}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Unit Info (read-only) ── */}
                <div className="px-5 pt-4 pb-0 flex-shrink-0">
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#1a1a2e] rounded-lg flex items-center justify-center flex-shrink-0">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                    <rect x="2" y="3" width="20" height="14" rx="2" />
                                    <line x1="8" y1="21" x2="16" y2="21" />
                                    <line x1="12" y1="17" x2="12" y2="21" />
                                </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-800 truncate">
                                    {unit.laptop?.laptop_name || "—"}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <span className="text-xs text-gray-500">
                                        SN: <code className="font-mono bg-gray-200 px-1.5 py-0.5 rounded text-gray-700 text-[10px]">
                                            {unit.serial_number}
                                        </code>
                                    </span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${unit.grade === "A" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                        unit.grade === "B" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                            "bg-red-50 text-red-700 border-red-200"
                                        }`}>
                                        Grade {unit.grade}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Form Body ── */}
                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-4 space-y-4 overscroll-contain">

                    {/* ── SECTION: Data Pelanggan ── */}
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                            Data Pelanggan
                        </p>
                        <div className="space-y-2.5">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                    Nama Pelanggan / Reseller <span className="text-red-400">*</span>
                                </label>
                                <input
                                    name="customer_name"
                                    value={form.customer_name}
                                    onChange={handleChange}
                                    placeholder="Nama lengkap..."
                                    autoFocus
                                    className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">No. HP / WhatsApp</label>
                                    <input
                                        name="customer_phone"
                                        value={form.customer_phone}
                                        onChange={handleChange}
                                        placeholder="08xxx..."
                                        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                        Perusahaan
                                    </label>
                                    <input
                                        name="company_name"
                                        value={form.company_name}
                                        onChange={handleChange}
                                        placeholder="Nama toko / perusahaan..."
                                        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── SECTION: Harga & Pembayaran ── */}
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                            Harga & Pembayaran
                        </p>
                        <div className="space-y-2.5">
                            <div className={`grid gap-2.5 ${isDP ? "grid-cols-2" : "grid-cols-1"}`}>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                        Harga Deal <span className="text-red-400">*</span>
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">Rp</span>
                                        <input
                                            name="deal_price"
                                            type="number"
                                            min="0"
                                            value={form.deal_price}
                                            onChange={handleChange}
                                            placeholder="0"
                                            className="w-full h-10 border border-gray-200 rounded-xl pl-8 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                                            required
                                        />
                                    </div>
                                </div>
                                {isDP && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                            Jumlah DP <span className="text-red-400">*</span>
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">Rp</span>
                                            <input
                                                name="dp_amount"
                                                type="number"
                                                min="0"
                                                value={form.dp_amount}
                                                onChange={handleChange}
                                                placeholder="0"
                                                className="w-full h-10 border border-gray-200 rounded-xl pl-8 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                                                required={isDP}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Preview sisa tagihan untuk DP */}
                            {isDP && form.deal_price && form.dp_amount && (
                                <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-violet-600">Harga Deal</span>
                                        <span className="font-semibold text-gray-700">
                                            Rp {Number(form.deal_price).toLocaleString("id-ID")}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs mt-1">
                                        <span className="text-violet-600">DP dibayar</span>
                                        <span className="font-semibold text-violet-700">
                                            − Rp {Number(form.dp_amount).toLocaleString("id-ID")}
                                        </span>
                                    </div>
                                    <div className="h-px bg-violet-200 my-1.5" />
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-bold text-violet-700">Sisa Tagihan</span>
                                        <span className="font-bold text-violet-700">
                                            Rp {Math.max(0, Number(form.deal_price) - Number(form.dp_amount)).toLocaleString("id-ID")}
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-2.5">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Metode Bayar</label>
                                    <select
                                        name="payment_method"
                                        value={form.payment_method}
                                        onChange={handleChange}
                                        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"
                                    >
                                        <option value="TRANSFER">Transfer</option>
                                        <option value="CASH">Cash</option>
                                        <option value="QRIS">QRIS</option>
                                        <option value="COD">COD</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Sumber / Platform</label>
                                    <input
                                        name="source_platform"
                                        value={form.source_platform}
                                        onChange={handleChange}
                                        placeholder="WA, FB, IG, Shopee..."
                                        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── SECTION: Pengiriman / Pengambilan ── */}
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                            Pengiriman
                        </p>
                        <div className="space-y-2.5">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Metode Pengambilan</label>
                                <select
                                    name="pickup_method"
                                    value={form.pickup_method}
                                    onChange={handleChange}
                                    className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"
                                >
                                    <option value="COD">COD / Ambil Langsung</option>
                                    <option value="DELIVERY">Antar ke Alamat</option>
                                    <option value="EKSPEDISI">Via Ekspedisi</option>
                                    <option value="OJOL">Ojek Online</option>
                                </select>
                            </div>
                            {(form.pickup_method === "DELIVERY" || form.pickup_method === "OJOL") && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Alamat Pengiriman</label>
                                    <textarea
                                        name="pickup_location"
                                        value={form.pickup_location}
                                        onChange={handleChange}
                                        placeholder="Jl. ..."
                                        rows={2}
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition resize-none"
                                    />
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-2.5">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Tanggal Pengambilan</label>
                                    <input
                                        name="pickup_date"
                                        type="date"
                                        value={form.pickup_date}
                                        onChange={handleChange}
                                        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Jam</label>
                                    <input
                                        name="pickup_time"
                                        type="time"
                                        value={form.pickup_time}
                                        onChange={handleChange}
                                        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── SECTION: Info Tambahan ── */}
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                            Info Tambahan
                        </p>
                        <div className="space-y-2.5">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Permintaan Software</label>
                                <input
                                    name="software_request"
                                    value={form.software_request}
                                    onChange={handleChange}
                                    placeholder="Contoh: Windows 11, Office 2021..."
                                    className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Catatan Tambahan</label>
                                <textarea
                                    name="notes"
                                    value={form.notes}
                                    onChange={handleChange}
                                    rows={2}
                                    placeholder="Keterangan khusus..."
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition resize-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Info banner */}
                    <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 border text-xs ${isDP
                        ? "bg-violet-50 border-violet-100 text-violet-700"
                        : "bg-orange-50 border-orange-100 text-orange-700"
                        }`}>
                        <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>
                            {isDP
                                ? `Unit SN ${unit.serial_number} akan dikunci (RESERVED). Konfirmasi pelunasan di halaman DP & Ambil Dulu.`
                                : `Unit SN ${unit.serial_number} akan berstatus HELD. Konfirmasi pelunasan di halaman DP & Ambil Dulu.`}
                        </span>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                            <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            </svg>
                            <p className="text-xs text-red-700">{error}</p>
                        </div>
                    )}
                </form>

                {/* ── Footer ── */}
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0 bg-white">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
                    >
                        Batal
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className={`flex-1 h-11 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2 ${isDP
                            ? "bg-violet-600 hover:bg-violet-700 active:bg-violet-800"
                            : "bg-orange-500 hover:bg-orange-600 active:bg-orange-700"
                            }`}
                    >
                        {loading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Menyimpan...
                            </>
                        ) : isDP ? (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                Kunci Unit (DP)
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                                Konfirmasi Ambil
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ConfirmPaymentModal({
    unit,
    onClose,
    onSuccess,
}: {
    unit: LaptopUnit;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [paymentProof, setPaymentProof] = useState<string | null>(null);
    const [uploadingProof, setUploadingProof] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    // ── Upload file ke server ──────────────────────────────────────────────
    const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingProof(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("invoice", unit.reserved_invoice || "proof");
            const res = await fetch("/api/receipt/upload-image", { method: "POST", body: formData });
            const result = await res.json();
            if (result.url) setPaymentProof(result.url);
            else throw new Error("URL tidak ditemukan di respons");
        } catch {
            setError("Gagal mengupload foto bukti");
        } finally {
            setUploadingProof(false);
        }
    };

    const handleConfirm = async () => {
        if (!unit.reserved_invoice) { setError("Invoice tidak ditemukan"); return; }
        if (!unit.serial_number) { setError("Serial number tidak ditemukan pada unit ini"); return; }

        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/units/confirm-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    invoice_number: unit.reserved_invoice,
                    serial_number: unit.serial_number,
                    payment_photo: paymentProof || null,
                }),
            });
            const result = await res.json();
            if (!result.success) { setError(result.message || "Gagal"); return; }
            onSuccess();
            onClose();
        } catch {
            setError("Terjadi kesalahan koneksi");
        } finally {
            setLoading(false);
        }
    };

    const statusLabel = unit.status === "RESERVED" ? "DP" : "Ambil Dulu";
    const statusColor = unit.status === "RESERVED"
        ? "bg-violet-50 text-violet-700 border-violet-200"
        : "bg-orange-50 text-orange-700 border-orange-200";
    const statusDot = unit.status === "RESERVED" ? "bg-violet-500" : "bg-orange-500";

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:mx-4 overflow-hidden">

                {/* Header */}
                <div className="bg-gradient-to-r from-emerald-50 to-green-50 px-5 py-4 border-b border-emerald-100 flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-800">Konfirmasi Lunas</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Transaksi akan menjadi PAID</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

                    {/* Info rows */}
                    <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100">
                        {[
                            {
                                label: "Status", value: (
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} /> {statusLabel}
                                    </span>
                                )
                            },
                            { label: "Invoice", value: <span className="text-xs font-mono font-semibold text-gray-700">{unit.reserved_invoice || "—"}</span> },
                            { label: "Dipesan oleh", value: <span className="text-xs font-semibold text-gray-800">{unit.reserved_by || "—"}</span> },
                            { label: "Laptop", value: <span className="text-xs font-semibold text-gray-800 text-right max-w-[55%]">{unit.laptop?.laptop_name || "—"}</span> },
                            { label: "Serial Number", value: <span className="text-xs font-mono bg-gray-200 px-2 py-0.5 rounded text-gray-800 font-semibold">{unit.serial_number || "—"}</span> },
                            { label: "Harga Jual", value: <span className="text-sm font-bold text-emerald-600">Rp {(unit.selling_price || 0).toLocaleString("id-ID")}</span> },
                        ].map(row => (
                            <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                                <span className="text-xs text-gray-400">{row.label}</span>
                                {row.value}
                            </div>
                        ))}
                    </div>

                    {/* Konteks status */}
                    {unit.status === "HELD" && (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 flex gap-2">
                            <span className="text-lg flex-shrink-0">📦</span>
                            <p className="text-xs text-orange-700">
                                Unit sudah diambil oleh <strong>{unit.reserved_by}</strong>.
                                Konfirmasi ini akan menandai transaksi sebagai <strong>LUNAS</strong>.
                            </p>
                        </div>
                    )}
                    {unit.status === "RESERVED" && (
                        <div className="bg-violet-50 border border-violet-200 rounded-xl px-3 py-2.5 flex gap-2">
                            <span className="text-lg flex-shrink-0">🔒</span>
                            <p className="text-xs text-violet-700">
                                Unit terkunci untuk <strong>{unit.reserved_by}</strong>.
                                Konfirmasi akan melunasi sisa tagihan dan menyerahkan unit.
                            </p>
                        </div>
                    )}

                    {/* ── Upload bukti bayar (file/kamera) ── */}
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">
                            Bukti Transfer
                            <span className="text-gray-400 font-normal ml-1">(opsional)</span>
                        </label>

                        {paymentProof ? (
                            /* Preview foto yang sudah diupload */
                            <div className="relative rounded-xl overflow-hidden border border-gray-200">
                                <img
                                    src={paymentProof}
                                    alt="Bukti bayar"
                                    className="w-full max-h-48 object-cover"
                                />
                                <div className="absolute inset-0 bg-black/10 flex items-start justify-end p-2">
                                    <button
                                        onClick={() => {
                                            setPaymentProof(null);
                                            if (fileInputRef.current) fileInputRef.current.value = "";
                                        }}
                                        className="w-7 h-7 bg-red-500 text-white rounded-lg flex items-center justify-center hover:bg-red-600 transition shadow"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="bg-emerald-50 border-t border-emerald-100 px-3 py-1.5 flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <p className="text-xs font-medium text-emerald-700">Foto berhasil diupload</p>
                                </div>
                            </div>
                        ) : (
                            /* Tombol upload — buka gallery/kamera */
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingProof}
                                className="w-full border-2 border-dashed border-gray-200 rounded-xl py-5 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-600 transition group"
                            >
                                {uploadingProof ? (
                                    <>
                                        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                                        <span className="text-xs font-medium">Mengupload...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        <div className="text-center">
                                            <p className="text-xs font-semibold">Foto Bukti Transfer</p>
                                            <p className="text-[10px] mt-0.5">Tap untuk buka galeri atau kamera</p>
                                        </div>
                                    </>
                                )}
                            </button>
                        )}

                        {/* Input file tersembunyi — accept image, bisa pakai kamera di mobile */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleProofUpload}
                            className="hidden"
                        />
                    </div>

                    {/* Warning */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex gap-2">
                        <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        <p className="text-xs text-amber-700">
                            Konfirmasi akan mengubah status menjadi <strong>PAID</strong> dan unit menjadi <strong>SOLD</strong>. Tidak dapat dibatalkan.
                        </p>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                            <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            </svg>
                            <p className="text-xs text-red-700">{error}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
                    <button onClick={onClose}
                        className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">
                        Batal
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading || uploadingProof}
                        className="flex-1 h-11 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Memproses...
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Konfirmasi Lunas
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonRows() {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                            {["Laptop", "SN", "Grade", "Harga Jual", "Status", "Aksi"].map(h => (
                                <th key={h} className="px-4 py-3 text-left">
                                    <div className="h-3 bg-gray-200 rounded w-16 animate-pulse" />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {[...Array(6)].map((_, i) => (
                            <tr key={i}>
                                {[180, 80, 50, 80, 70, 100].map((w, j) => (
                                    <td key={j} className="px-4 py-3.5">
                                        <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: w }} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReadyPage() {
    const [units, setUnits] = useState<LaptopUnit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const [salesName, setSalesName] = useState("");

    // Filters
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState("ALL");
    const [filterGrade, setFilterGrade] = useState("ALL");

    // Modals
    const [alertMsg, setAlertMsg] = useState<string | null>(null);
    const [reserveTarget, setReserveTarget] = useState<{ unit: LaptopUnit; type: "RESERVED" | "HELD" } | null>(null);
    const [confirmTarget, setConfirmTarget] = useState<LaptopUnit | null>(null);

    const canCreateTx = userRole ? hasPermission(userRole, PERMISSIONS.CREATE_TRANSACTION) : false;
    const canConfirmTx = userRole ? hasPermission(userRole, PERMISSIONS.EDIT_TRANSACTION) : false;
    const canSeePrices = userRole ? hasPermission(userRole, ["ADMIN", "ACCOUNTING", "PENGELOLA_BARANG"] as UserRole[]) : false;

    const [confirmedUnitIds, setConfirmedUnitIds] = useState<Set<string>>(new Set());

    // Fetch user info
    useEffect(() => {
        fetch("/api/auth/me")
            .then(r => r.json())
            .then(r => {
                setUserRole(r.user?.role ?? null);
                setSalesName(r.user?.name ?? "");
            })
            .catch(() => setUserRole(null));
    }, []);

    const fetchUnits = async () => {
        setIsLoading(true);
        try {
            // Ambil semua unit yang SIAP_JUAL + RESERVED + HELD
            const res = await fetch("/api/laptops/ready-units");
            const result = await res.json();
            if (result.success) {
                setUnits((result.data || []).map((u: LaptopUnit) => ({
                    ...u,
                    purchase_price: Math.round(Number(u.purchase_price) || 0),
                    selling_price: Math.round(Number(u.selling_price) || 0),
                })));
            }
        } catch {
            setUnits([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchUnits(); }, []);

    // Filtered + sorted
    const filtered = useMemo(() => {
        let list = [...units];

        if (filterStatus !== "ALL") list = list.filter(u => u.status === filterStatus);
        if (filterGrade !== "ALL") list = list.filter(u => u.grade === filterGrade);
        if (search.trim()) {
            const t = search.toLowerCase();
            list = list.filter(u =>
                u.laptop?.laptop_name?.toLowerCase().includes(t) ||
                u.serial_number?.toLowerCase().includes(t) ||
                u.laptop?.brand?.toLowerCase().includes(t) ||
                u.reserved_by?.toLowerCase().includes(t)
            );
        }
        // Sort: SIAP_JUAL dulu, lalu HELD, lalu RESERVED
        const order: Record<string, number> = { SIAP_JUAL: 0, HELD: 1, RESERVED: 2, SOLD: 3 };
        list.sort((a, b) => {
            const statusDiff = (order[a.status] ?? 9) - (order[b.status] ?? 9);
            if (statusDiff !== 0) return statusDiff;
            return (a.laptop?.laptop_name ?? "").localeCompare(b.laptop?.laptop_name ?? "", "id");
        });
        return list;
    }, [units, filterStatus, filterGrade, search]);

    const counts = {
        all: units.length,
        siap: units.filter(u => u.status === "SIAP_JUAL").length,
        reserved: units.filter(u => u.status === "RESERVED").length,
        held: units.filter(u => u.status === "HELD").length,
    };

    return (
        <DashboardLayout>
            <main className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-4 sm:p-6 lg:p-8">
                <div className="max-w-full mx-auto space-y-5">

                    {/* Header */}
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-8 h-8 bg-[#1a1a2e] rounded-xl flex items-center justify-center shadow-sm">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <path d="M9 12l2 2 4-4" />
                                        <rect x="2" y="3" width="20" height="14" rx="2" />
                                        <line x1="8" y1="21" x2="16" y2="21" />
                                        <line x1="12" y1="17" x2="12" y2="21" />
                                    </svg>
                                </div>
                                <div>
                                    <h1 className="text-xl sm:text-2xl font-bold text-[#1a1a2e] tracking-tight">Laptop Siap Jual</h1>
                                    <p className="text-xs text-gray-400 mt-0.5">Unit tersedia, dipesan, dan diambil reseller</p>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={fetchUnits}
                            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-2 rounded-xl transition bg-white"
                        >
                            <svg className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                        </button>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: "Total Unit", value: counts.all, color: "text-gray-800", bg: "bg-white", bar: "bg-gray-400" },
                            { label: "Siap Jual", value: counts.siap, color: "text-emerald-600", bg: "bg-emerald-50", bar: "bg-emerald-500" },
                            { label: "Dipesan", value: counts.reserved, color: "text-violet-600", bg: "bg-violet-50", bar: "bg-violet-500" },
                            { label: "Diambil", value: counts.held, color: "text-orange-600", bg: "bg-orange-50", bar: "bg-orange-500" },
                        ].map(s => (
                            <div key={s.label} className={`${s.bg} rounded-2xl border border-gray-100 shadow-sm p-4 relative overflow-hidden`}>
                                <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${s.bar} opacity-60`} />
                                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{s.label}</p>
                                <p className={`text-2xl font-extrabold mt-1 ${s.color}`}>{s.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Filter */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                        <div className="flex flex-wrap gap-2">
                            {/* Status tabs */}
                            {[
                                { value: "ALL", label: "Semua", count: counts.all },
                                { value: "SIAP_JUAL", label: "✅ Siap Jual", count: counts.siap },
                                { value: "RESERVED", label: "🔒 Dipesan", count: counts.reserved },
                                { value: "HELD", label: "📦 Diambil", count: counts.held },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setFilterStatus(opt.value)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${filterStatus === opt.value
                                        ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                                        }`}
                                >
                                    {opt.label}
                                    <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs ${filterStatus === opt.value ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                                        }`}>
                                        {opt.count}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            {/* Search */}
                            <div className="relative flex-1">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Cari nama laptop, SN, pemesan..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="w-full h-10 border border-gray-200 rounded-xl pl-9 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition"
                                />
                            </div>
                            {/* Grade filter */}
                            <select
                                value={filterGrade}
                                onChange={e => setFilterGrade(e.target.value)}
                                className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"
                            >
                                <option value="ALL">Semua Grade</option>
                                <option value="A">Grade A</option>
                                <option value="B">Grade B</option>
                                <option value="C">Grade C</option>
                            </select>
                            {(search || filterStatus !== "ALL" || filterGrade !== "ALL") && (
                                <button
                                    onClick={() => { setSearch(""); setFilterStatus("ALL"); setFilterGrade("ALL"); }}
                                    className="h-10 px-3 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Table */}
                    {isLoading ? (
                        <SkeletonRows />
                    ) : filtered.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
                            <div className="text-4xl mb-3">💻</div>
                            <p className="text-gray-500 font-medium">Tidak ada unit ditemukan</p>
                            <p className="text-gray-400 text-sm mt-1">Coba ubah filter pencarian</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50/80 border-b border-gray-100">
                                            <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Laptop</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Serial Number</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Grade</th>
                                            {canSeePrices && (
                                                <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Harga Modal</th>
                                            )}
                                            <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Harga Jual</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Pemesan</th>
                                            <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {filtered.map(unit => {
                                            const st = STATUS_CONFIG[unit.status];
                                            const isAvailable = unit.status === "SIAP_JUAL";
                                            const isPending = unit.status === "RESERVED" || unit.status === "HELD";
                                            return (
                                                <tr
                                                    key={unit.id}
                                                    className={`transition-colors ${unit.status === "RESERVED" ? "bg-violet-50/30 hover:bg-violet-50/50" :
                                                        unit.status === "HELD" ? "bg-orange-50/30 hover:bg-orange-50/50" :
                                                            "hover:bg-gray-50/70"
                                                        }`}
                                                >
                                                    <td className="px-4 py-3.5 max-w-[200px]">
                                                        <p className="font-semibold text-gray-800 truncate text-sm" title={unit.laptop?.laptop_name}>
                                                            {unit.laptop?.laptop_name || "—"}
                                                        </p>
                                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                                            {[unit.laptop?.brand, unit.laptop?.cpu, unit.laptop?.ram].filter(Boolean).join(" · ")}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded">
                                                            {unit.serial_number}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${GRADE_BADGE[unit.grade] || ""}`}>
                                                            {unit.grade}
                                                        </span>
                                                    </td>
                                                    {canSeePrices && (
                                                        <td className="px-4 py-3.5 text-right text-xs text-gray-500 whitespace-nowrap tabular-nums">
                                                            {fmt(unit.purchase_price)}
                                                        </td>
                                                    )}
                                                    <td className="px-4 py-3.5 text-right font-semibold text-gray-800 whitespace-nowrap tabular-nums">
                                                        {fmt(unit.selling_price)}
                                                    </td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        {st && (
                                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${st.badge}`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.dot}`} />
                                                                {st.label}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        {isPending && unit.reserved_by ? (
                                                            <div>
                                                                <p className="text-xs font-semibold text-gray-700">{unit.reserved_by}</p>
                                                                {unit.reserved_invoice && (
                                                                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">{unit.reserved_invoice}</p>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-300 text-xs">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            {/* Tombol DP — hanya untuk unit SIAP_JUAL */}
                                                            {isAvailable && canCreateTx && (
                                                                <>
                                                                    <button
                                                                        onClick={() => setReserveTarget({ unit, type: "RESERVED" })}
                                                                        className="px-2.5 py-1.5 text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition"
                                                                    >
                                                                        DP
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setReserveTarget({ unit, type: "HELD" })}
                                                                        className="px-2.5 py-1.5 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition"
                                                                    >
                                                                        Ambil Dulu
                                                                    </button>
                                                                </>
                                                            )}
                                                            {isPending && canConfirmTx && !confirmedUnitIds.has(unit.id) && (
                                                                <button
                                                                    onClick={() => setConfirmTarget(unit)}
                                                                    className="px-2.5 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition"
                                                                >
                                                                    ✓ Lunas
                                                                </button>
                                                            )}

                                                            {isPending && confirmedUnitIds.has(unit.id) && (
                                                                <span className="px-2.5 py-1.5 text-xs font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-1">
                                                                    <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                    Lunas
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/40">
                                <p className="text-xs text-gray-400">
                                    Menampilkan <span className="font-semibold text-gray-600">{filtered.length}</span> dari{" "}
                                    <span className="font-semibold text-gray-600">{units.length}</span> unit
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Modals */}
            {alertMsg && (
                <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
            )}
            {reserveTarget && (
                <ReserveModal
                    unit={reserveTarget.unit}
                    type={reserveTarget.type}
                    salesName={salesName}
                    onClose={() => setReserveTarget(null)}
                    onSuccess={() => { setAlertMsg("Berhasil disimpan ✅"); fetchUnits(); }}
                />
            )}
            {confirmTarget && (
                <ConfirmPaymentModal
                    unit={confirmTarget}
                    onClose={() => setConfirmTarget(null)}
                    onSuccess={() => {
                        setConfirmedUnitIds(prev => new Set([...prev, confirmTarget.id]));
                        setAlertMsg("Pembayaran dikonfirmasi, transaksi PAID ✅");
                        fetchUnits();
                    }}
                />
            )}
        </DashboardLayout>
    );
}