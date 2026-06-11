"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole } from "@/lib/permissions";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PendingTransaction {
    id: string;
    invoice_number: string;
    status: "RESERVED" | "HELD" | "PAID";
    customer_name: string;
    customer_phone: string | null;
    company_name: string | null;
    laptop_name: string;
    serial_number: string | null;
    unit_id: string | null;
    laptop_id: string | null;
    deal_price: number;
    dp_amount?: number;
    amount: number;
    payment_method: string;
    source_platform: string | null;
    notes: string | null;
    sales_name: string;
    created_at: string;
    paid_at: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

function fmtDate(iso: string) {
    if (!iso) return "—";
    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
}

function daysSince(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return "Hari ini";
    if (days === 1) return "1 hari lalu";
    return `${days} hari lalu`;
}

// ✅ Detect apakah transaksi PAID ini dulunya RESERVED/HELD
function getOriginalStatus(tx: PendingTransaction): "RESERVED" | "HELD" | null {
    if (tx.status !== "PAID") return null;
    if (tx.dp_amount && tx.dp_amount > 0) return "RESERVED";
    if (tx.paid_at && tx.created_at) {
        const diffMs = new Date(tx.paid_at).getTime() - new Date(tx.created_at).getTime();
        if (diffMs > 60 * 60 * 1000) return "HELD"; // jeda > 1 jam
    }
    return null;
}

// ─── Badge configs ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
    RESERVED: { label: "DP", badge: "bg-gray-100 text-gray-700 border-gray-200", dot: "bg-gray-500" },
    HELD: { label: "Ambil Dulu", badge: "bg-gray-100 text-gray-700 border-gray-200", dot: "bg-gray-500" },
} as const;

// ─── AlertModal ───────────────────────────────────────────────────────────────
function AlertModal({ message, onClose }: { message: string; onClose: () => void }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center animate-scaleIn">
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm font-medium mb-5">{message}</p>
                <button onClick={onClose} className="w-full h-11 bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition shadow-md">OK</button>
            </div>
        </div>
    );
}

// ─── SkeletonCard ─────────────────────────────────────────────────────────────
function SkeletonCard() {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="h-1 bg-gray-100" />
            <div className="p-5 space-y-4 animate-pulse">
                <div className="flex justify-between">
                    <div className="space-y-2">
                        <div className="h-3 bg-gray-200 rounded w-28" />
                        <div className="h-4 bg-gray-200 rounded w-36" />
                        <div className="h-3 bg-gray-200 rounded w-24" />
                    </div>
                    <div className="h-6 bg-gray-200 rounded w-24" />
                </div>
                <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-48" />
                    <div className="h-3 bg-gray-200 rounded w-32" />
                </div>
                <div className="flex gap-2">
                    <div className="flex-1 h-9 bg-gray-200 rounded-xl" />
                    <div className="flex-1 h-9 bg-gray-200 rounded-xl" />
                </div>
            </div>
        </div>
    );
}

// ─── HistoryCard ──────────────────────────────────────────────────────────────
function HistoryCard({ tx, onDetail, onWhatsApp }: {
    tx: PendingTransaction;
    onDetail: (tx: PendingTransaction) => void;
    onWhatsApp: (tx: PendingTransaction) => void;
}) {
    const originalStatus = getOriginalStatus(tx) ?? "HELD";
    const fmtPaidAt = tx.paid_at ? new Intl.DateTimeFormat("id-ID", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    }).format(new Date(tx.paid_at)) : null;

    return (
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden animate-fadeUp">
            <div className="h-1 bg-emerald-400" />
            <div className="p-4 sm:p-5">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                            <code className="font-mono text-xs font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
                                {tx.invoice_number}
                            </code>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${originalStatus === "RESERVED"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : "bg-orange-50 text-orange-700 border-orange-200"
                                }`}>
                                {originalStatus === "RESERVED" ? "💳 DP" : "📦 Ambil Dulu"}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                Lunas
                            </span>
                        </div>
                        <p className="text-base font-bold text-gray-800 truncate">{tx.customer_name}</p>
                        {tx.customer_phone && <p className="text-xs text-gray-400 mt-0.5">📱 {tx.customer_phone}</p>}
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-gray-800 tabular-nums">{fmt(tx.deal_price || tx.amount)}</p>
                        <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full mt-1 inline-block">{tx.payment_method}</span>
                    </div>
                </div>

                {/* Laptop */}
                <div className="bg-gray-50 rounded-xl px-3 py-2.5 mb-3">
                    <p className="text-sm font-semibold text-gray-800 truncate">{tx.laptop_name}</p>
                    {tx.serial_number && <code className="text-[11px] font-mono text-gray-500 mt-0.5 block">SN: {tx.serial_number}</code>}
                </div>

                {/* Tanggal lunas */}
                {fmtPaidAt && (
                    <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mb-3">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-medium">Lunas: {fmtPaidAt}</span>
                    </div>
                )}

                <div className="text-[11px] text-gray-400 mb-4">Order: {fmtDate(tx.created_at)} · Oleh {tx.sales_name}</div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => onDetail(tx)}
                        className="h-9 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-200 transition flex items-center justify-center gap-1.5">
                        📋 Detail
                    </button>
                    {tx.customer_phone && (
                        <button onClick={() => onWhatsApp(tx)}
                            className="h-9 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-200 transition flex items-center justify-center gap-1.5 border border-gray-200">
                            💬 WA
                        </button>
                    )}
                    <a href={`/receipt/${tx.invoice_number}`}
                        className="h-9 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-medium hover:bg-emerald-100 transition flex items-center justify-center gap-1.5 col-span-full">
                        📄 Lihat Receipt
                    </a>
                </div>
            </div>
        </div>
    );
}

// ─── TransactionCard ──────────────────────────────────────────────────────────
function TransactionCard({ tx, canConfirm, onConfirm, onDetail, onWhatsApp }: {
    tx: PendingTransaction;
    canConfirm: boolean;
    onConfirm: (tx: PendingTransaction) => void;
    onDetail: (tx: PendingTransaction) => void;
    onWhatsApp: (tx: PendingTransaction) => void;
}) {
    const cfg = STATUS_CONFIG[tx.status as "RESERVED" | "HELD"];
    const isOld = Date.now() - new Date(tx.created_at).getTime() > 3 * 86_400_000;

    return (
        <div className={`bg-white rounded-2xl border shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden animate-fadeUp ${isOld ? "border-amber-200" : "border-gray-100"}`}>
            <div className="h-1 bg-gray-500" />
            <div className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <code className="font-mono text-xs font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">{tx.invoice_number}</code>
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${cfg?.badge}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg?.dot} animate-pulse`} />
                                {cfg?.label}
                            </span>
                            {isOld && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200">
                                    ⚠️ {daysSince(tx.created_at)}
                                </span>
                            )}
                        </div>
                        <p className="text-base font-bold text-gray-800 mt-2 truncate">{tx.customer_name}</p>
                        {tx.customer_phone && <p className="text-xs text-gray-400 mt-0.5">📱 {tx.customer_phone}</p>}
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-gray-800 tabular-nums">{fmt(tx.deal_price || tx.amount)}</p>
                        <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full mt-1 inline-block">{tx.payment_method}</span>
                    </div>
                </div>

                <div className="bg-gray-50 rounded-xl px-3 py-2.5 mb-4">
                    <p className="text-sm font-semibold text-gray-800 truncate">{tx.laptop_name}</p>
                    {tx.serial_number
                        ? <code className="text-[11px] font-mono text-gray-500 mt-0.5 block">SN: {tx.serial_number}</code>
                        : <p className="text-[11px] text-amber-500 mt-1">⚠️ SN belum ditentukan</p>}
                </div>

                <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                    <span className="text-[11px] font-medium text-gray-500">👤 {tx.sales_name}</span>
                    <span className="text-[10px] text-gray-400">{fmtDate(tx.created_at)}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button onClick={() => onDetail(tx)}
                        className="h-9 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-200 transition flex items-center justify-center gap-1.5">
                        📋 Detail
                    </button>
                    {tx.customer_phone && (
                        <button onClick={() => onWhatsApp(tx)}
                            className="h-9 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-200 transition flex items-center justify-center gap-1.5 border border-gray-200">
                            💬 WA
                        </button>
                    )}
                    {canConfirm && (
                        <button onClick={() => onConfirm(tx)}
                            className="h-9 bg-gray-700 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition flex items-center justify-center gap-1.5 shadow-md">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Lunas
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── DetailModal ──────────────────────────────────────────────────────────────
function DetailModal({ tx, onClose }: { tx: PendingTransaction; onClose: () => void }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const originalStatus = getOriginalStatus(tx);
    const statusLabel = tx.status === "PAID" && originalStatus
        ? `${originalStatus === "RESERVED" ? "DP" : "Ambil Dulu"} → Lunas`
        : (STATUS_CONFIG[tx.status as "RESERVED" | "HELD"]?.label ?? tx.status);

    const rows: { label: string; value: React.ReactNode }[] = [
        { label: "Invoice", value: <span className="font-mono text-xs font-semibold text-gray-600">{tx.invoice_number}</span> },
        { label: "Status", value: <span className="text-xs font-bold text-gray-700">{statusLabel}</span> },
        { label: "Customer", value: tx.customer_name },
        { label: "No. HP", value: tx.customer_phone || "—" },
        { label: "Perusahaan", value: tx.company_name || "—" },
        { label: "Laptop", value: tx.laptop_name },
        { label: "Serial Number", value: tx.serial_number ? <code className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">{tx.serial_number}</code> : <span className="text-gray-400 text-xs">Belum ditentukan</span> },
        { label: "Harga Deal", value: <span className="font-bold text-gray-800">{fmt(tx.deal_price || tx.amount)}</span> },
        { label: "Metode Bayar", value: tx.payment_method },
        { label: "Platform", value: tx.source_platform || "—" },
        { label: "Sales", value: tx.sales_name },
        { label: "Dibuat", value: fmtDate(tx.created_at) },
        ...(tx.paid_at ? [{ label: "Lunas", value: fmtDate(tx.paid_at) }] : []),
        { label: "Catatan", value: tx.notes || "—" },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-fadeIn">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:mx-4 overflow-hidden animate-slideUp">
                <div className="bg-gray-700 px-5 py-4 shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-bold text-white text-base">Detail Transaksi</h2>
                            <p className="text-xs text-gray-300 mt-0.5">{tx.invoice_number}</p>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/20 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div className="overflow-y-auto flex-1 px-5 py-4">
                    <div className="divide-y divide-gray-100">
                        {rows.map(row => (
                            <div key={row.label} className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-2">
                                <span className="text-xs text-gray-400 font-medium sm:w-28">{row.label}</span>
                                <span className="text-xs text-gray-800 text-left sm:text-right font-medium break-all">{row.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="px-5 py-4 border-t border-gray-100 shrink-0 bg-white">
                    <button onClick={onClose} className="w-full h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Tutup</button>
                </div>
            </div>
        </div>
    );
}

// ─── ConfirmPaymentModal ──────────────────────────────────────────────────────
function ConfirmPaymentModal({ tx, onClose, onSuccess }: {
    tx: PendingTransaction; onClose: () => void; onSuccess: () => void;
}) {
    const [paymentPhoto, setPaymentPhoto] = useState<string | null>(null);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingPhoto(true); setError("");
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("invoice", tx.invoice_number);
            const res = await fetch("/api/receipt/upload-image", { method: "POST", body: fd });
            const r = await res.json();
            if (r.url) setPaymentPhoto(r.url);
            else throw new Error();
        } catch { setError("Gagal mengupload foto bukti"); }
        finally { setUploadingPhoto(false); }
    };

    const handleConfirm = async () => {
        setLoading(true); setError("");
        try {
            const res = await fetch("/api/units/confirm-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    invoice_number: tx.invoice_number,
                    serial_number: tx.serial_number || undefined,
                    payment_photo: paymentPhoto || undefined,
                }),
            });
            const r = await res.json();
            if (!r.success) { setError(r.message || "Gagal konfirmasi"); return; }
            onSuccess(); onClose();
        } catch { setError("Terjadi kesalahan koneksi"); }
        finally { setLoading(false); }
    };

    const cfg = STATUS_CONFIG[tx.status as "RESERVED" | "HELD"];

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-fadeIn">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:mx-4 overflow-hidden animate-slideUp">
                <div className="bg-gray-700 px-5 py-4 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="font-bold text-white text-base">Konfirmasi Lunas</h2>
                                <p className="text-xs text-gray-300 mt-0.5">{tx.invoice_number}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/20 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                    <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100">
                        {[
                            { label: "Status", value: <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg?.badge}`}><span className={`w-1.5 h-1.5 rounded-full ${cfg?.dot} animate-pulse`} />{cfg?.label}</span> },
                            { label: "Customer", value: <span className="text-xs font-semibold text-gray-800">{tx.customer_name}</span> },
                            { label: "Laptop", value: <span className="text-xs font-semibold text-gray-800">{tx.laptop_name}</span> },
                            { label: "Serial Number", value: tx.serial_number ? <code className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded-md text-gray-800">{tx.serial_number}</code> : <span className="text-xs text-amber-500">⚠️ Tidak ada SN</span> },
                            { label: "Harga Deal", value: <span className="text-sm font-bold text-gray-800">{fmt(tx.deal_price || tx.amount)}</span> },
                        ].map((row, i) => (
                            <div key={i} className="flex items-center justify-between px-4 py-3">
                                <span className="text-xs text-gray-400 shrink-0">{row.label}</span>
                                <div className="text-right">{row.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Upload bukti */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Bukti Transfer <span className="text-gray-400 font-normal">(opsional)</span></label>
                        {paymentPhoto ? (
                            <div className="relative rounded-xl overflow-hidden border border-gray-200">
                                <img src={paymentPhoto} alt="Bukti bayar" className="w-full max-h-48 object-cover" />
                                <button onClick={() => { setPaymentPhoto(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                                    className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-lg flex items-center justify-center hover:bg-red-600 transition shadow">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                                <div className="bg-gray-100 border-t border-gray-200 px-3 py-1.5">
                                    <p className="text-xs font-medium text-gray-700">✓ Foto berhasil diupload</p>
                                </div>
                            </div>
                        ) : (
                            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}
                                className="w-full border-2 border-dashed border-gray-200 rounded-xl py-6 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-gray-300 hover:bg-gray-50 transition group">
                                {uploadingPhoto ? (
                                    <><div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" /><span className="text-xs">Mengupload...</span></>
                                ) : (
                                    <><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg><span className="text-xs font-semibold">Foto Bukti Transfer</span></>
                                )}
                            </button>
                        )}
                        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoUpload} className="hidden" />
                    </div>

                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                        <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        <p className="text-xs text-amber-700">Konfirmasi akan mengubah status menjadi <strong>PAID</strong> dan unit menjadi <strong>SOLD</strong>. Tidak dapat dibatalkan.</p>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700 animate-shake">{error}</div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0 bg-white">
                    <button onClick={onClose} disabled={loading} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50">Batal</button>
                    <button onClick={handleConfirm} disabled={loading || uploadingPhoto}
                        className="flex-1 h-11 bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-40 flex items-center justify-center gap-2 shadow-md">
                        {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Memproses...</> : <>✓ Konfirmasi Lunas</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function PendingOrdersPage() {
    // ── State pending ──
    const [transactions, setTransactions] = useState<PendingTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<"ALL" | "RESERVED" | "HELD">("ALL");
    const [searchQuery, setSearchQuery] = useState("");

    // ✅ State tab + history — HARUS di sini, di level component
    const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");
    const [historyTransactions, setHistoryTransactions] = useState<PendingTransaction[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const [alertModal, setAlertModal] = useState<string | null>(null);
    const [confirmPaymentTx, setConfirmPaymentTx] = useState<PendingTransaction | null>(null);
    const [detailTx, setDetailTx] = useState<PendingTransaction | null>(null);

    const canConfirm = userRole
        ? (["ADMIN", "KEPALA_SALES", "CREW_SALES"] as UserRole[]).includes(userRole)
        : false;

    useEffect(() => {
        fetch("/api/auth/me").then(r => r.json()).then(r => setUserRole(r.user?.role ?? null)).catch(() => setUserRole(null));
    }, []);

    // ── Fetch pending ──
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/transaction/pending");
            const result = await res.json();
            if (result.success) setTransactions(result.data || []);
        } catch { /* ignore */ }
        finally { setIsLoading(false); }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const fetchHistory = useCallback(async () => {
        setIsLoadingHistory(true);
        try {
            const res = await fetch("/api/transaction?status=PAID&limit=200");
            const result = await res.json();
            if (result.success) {
                const paid = (result.data || []).filter((tx: PendingTransaction) => {
                    // DP: dp_amount > 0 selalu reliable
                    if (tx.dp_amount && tx.dp_amount > 0) return true;
                    // Ambil Dulu: ada jeda antara created_at dan paid_at
                    if (tx.paid_at && tx.created_at) {
                        const diffMs = new Date(tx.paid_at).getTime() - new Date(tx.created_at).getTime();
                        return diffMs > 5 * 60 * 1000; // ✅ turun dari 1 jam → 5 menit
                    }
                    return false;
                });
                setHistoryTransactions(paid);
            }
        } catch { /* ignore */ }
        finally { setIsLoadingHistory(false); }
    }, []);


    // Load history saat tab history dibuka pertama kali
    useEffect(() => {
        if (activeTab === "history" && historyTransactions.length === 0) {
            fetchHistory();
        }
    }, [activeTab]);

    const handleWhatsApp = (tx: PendingTransaction) => {
        if (!tx.customer_phone) return;
        const phone = tx.customer_phone.replace(/\D/g, "").replace(/^0/, "62");
        const statusLabel = tx.status === "RESERVED" ? "DP" : "Ambil Dulu";
        const message = [
            `Halo *${tx.customer_name}*,`,
            ``,
            `Kami ingin mengingatkan mengenai transaksi *${statusLabel}* berikut:`,
            ``,
            `📋 Invoice: *${tx.invoice_number}*`,
            `💻 Laptop: *${tx.laptop_name}*`,
            `💰 Harga Deal: *${fmt(tx.deal_price || tx.amount)}*`,
            ``,
            `Mohon segera lakukan pelunasan. Terima kasih! 🙏`,
            ``,
            `— *Solit*`,
        ].join("\n");
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
    };

    const filtered = transactions.filter(tx => {
        if (filterStatus !== "ALL" && tx.status !== filterStatus) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return tx.customer_name.toLowerCase().includes(q) ||
                tx.invoice_number.toLowerCase().includes(q) ||
                tx.laptop_name.toLowerCase().includes(q) ||
                (tx.serial_number || "").toLowerCase().includes(q) ||
                (tx.customer_phone || "").includes(q);
        }
        return true;
    });

    const counts = {
        all: transactions.length,
        reserved: transactions.filter(t => t.status === "RESERVED").length,
        held: transactions.filter(t => t.status === "HELD").length,
    };

    const totalValue = filtered.reduce((sum, tx) => sum + (tx.deal_price || tx.amount || 0), 0);

    return (
        <DashboardLayout>
            <style>{`
                    @keyframes fadeIn  { from { opacity:0; transform:scale(0.95) }  to { opacity:1; transform:scale(1) } }
                    @keyframes scaleIn { from { opacity:0; transform:scale(0.9) }   to { opacity:1; transform:scale(1) } }
                    @keyframes slideUp { from { transform:translateY(100%); opacity:0 } to { transform:translateY(0); opacity:1 } }
                    @keyframes fadeUp  { from { opacity:0; transform:translateY(15px) } to { opacity:1; transform:translateY(0) } }
                    @keyframes shake   { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
                    .animate-fadeIn  { animation: fadeIn  0.3s ease-out; }
                    .animate-scaleIn { animation: scaleIn 0.25s ease-out; }
                    .animate-slideUp { animation: slideUp 0.3s ease-out; }
                    .animate-fadeUp  { animation: fadeUp  0.4s ease-out; }
                    .animate-shake   { animation: shake   0.3s ease-in-out; }
                `}</style>

            <main className="min-h-screen bg-white p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto space-y-5">

                    {/* Header */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-1 h-7 bg-gray-700 rounded-full" />
                                <h1 className="text-2xl font-bold text-gray-800">DP & Ambil Dulu</h1>
                            </div>
                            <p className="text-sm text-gray-500 ml-3">Transaksi yang belum dilunasi — <span className="text-gray-600 font-medium">Perlu tindakan</span></p>
                        </div>
                        <button onClick={() => { fetchData(); if (activeTab === "history") fetchHistory(); }}
                            disabled={isLoading}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition shadow-sm group">
                            <svg className={`w-4 h-4 ${isLoading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                        </button>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: "Total Pending", value: counts.all, icon: "📋", bg: "bg-white" },
                            { label: "DP (Reserved)", value: counts.reserved, icon: "💳", bg: "bg-gray-50" },
                            { label: "Ambil Dulu", value: counts.held, icon: "📦", bg: "bg-gray-50" },
                            { label: "Total Nilai", value: fmt(totalValue), icon: "💰", bg: "bg-gray-100" },
                        ].map(stat => (
                            <div key={stat.label} className={`${stat.bg} rounded-2xl border border-gray-100 shadow-sm p-4 relative overflow-hidden group hover:shadow-md transition`}>
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-500 opacity-60 group-hover:opacity-100 transition" />
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{stat.label}</p>
                                    <span className="text-lg opacity-60 group-hover:opacity-100 transition">{stat.icon}</span>
                                </div>
                                <p className="text-2xl font-extrabold mt-1 text-gray-800">{stat.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* ✅ Tab Switcher: Belum Lunas | Sudah Lunas */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="grid grid-cols-2 border-b border-gray-100">
                            {([
                                { key: "pending", label: "⏳ Belum Lunas", count: counts.all },
                                { key: "history", label: "✅ Sudah Lunas", count: historyTransactions.length },
                            ] as const).map(tab => (
                                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                    className={`py-3 px-4 text-sm font-semibold transition-all ${activeTab === tab.key ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-50"}`}>
                                    {tab.label}
                                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? "bg-white/20" : "bg-gray-100"}`}>
                                        {tab.count}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Sub-filter untuk Belum Lunas */}
                        {activeTab === "pending" && (
                            <div className="p-1.5">
                                <div className="grid grid-cols-3 gap-1.5">
                                    {([
                                        { value: "ALL", label: "Semua", count: counts.all, icon: "📋" },
                                        { value: "RESERVED", label: "DP", count: counts.reserved, icon: "💳" },
                                        { value: "HELD", label: "Ambil Dulu", count: counts.held, icon: "📦" },
                                    ] as const).map(opt => (
                                        <button key={opt.value} onClick={() => setFilterStatus(opt.value)}
                                            className={`flex flex-col items-center py-2.5 px-2 rounded-xl text-center transition-all ${filterStatus === opt.value ? "bg-gray-700 text-white shadow-md scale-105" : "text-gray-500 hover:bg-gray-50"}`}>
                                            <span className="text-lg">{opt.icon}</span>
                                            <span className="text-[10px] font-medium mt-0.5">{opt.label}</span>
                                            <span className={`text-sm font-bold mt-0.5 ${filterStatus === opt.value ? "text-white" : "text-gray-700"}`}>{opt.count}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input type="text" placeholder="Cari nama customer, invoice, laptop, atau no HP..."
                            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full h-11 border border-gray-200 rounded-xl pl-9 pr-9 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 transition shadow-sm" />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        )}
                    </div>

                    {/* Content */}
                    {activeTab === "pending" ? (
                        isLoading ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
                                <div className="text-6xl mb-4">{transactions.length === 0 ? "🎉" : "🔍"}</div>
                                <p className="text-gray-500 font-semibold">
                                    {transactions.length === 0 ? "Tidak ada transaksi pending" : "Tidak ada hasil untuk pencarian ini"}
                                </p>
                                <p className="text-gray-400 text-sm mt-2">
                                    {transactions.length === 0 ? "Semua transaksi sudah dilunasi" : "Coba ubah kata kunci atau filter"}
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filtered.map(tx => (
                                        <TransactionCard key={tx.id} tx={tx} canConfirm={canConfirm}
                                            onConfirm={setConfirmPaymentTx} onDetail={setDetailTx} onWhatsApp={handleWhatsApp} />
                                    ))}
                                </div>
                                <div className="flex items-center justify-center gap-2 pt-2">
                                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                                    <p className="text-xs text-gray-400">
                                        <span className="font-semibold text-gray-600">{filtered.length}</span> dari <span className="font-semibold text-gray-600">{transactions.length}</span> transaksi
                                    </p>
                                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                                </div>
                            </>
                        )
                    ) : (
                        // ── Tab History ──
                        isLoadingHistory ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
                            </div>
                        ) : historyTransactions.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
                                <div className="text-6xl mb-4">📭</div>
                                <p className="text-gray-500 font-semibold">Belum ada riwayat pelunasan</p>
                                <p className="text-gray-400 text-sm mt-2">Transaksi DP & Ambil Dulu yang sudah lunas akan muncul di sini</p>
                                <button onClick={fetchHistory}
                                    className="mt-4 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">
                                    🔄 Muat Ulang
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {historyTransactions.map(tx => (
                                        <HistoryCard key={tx.id} tx={tx} onDetail={setDetailTx} onWhatsApp={handleWhatsApp} />
                                    ))}
                                </div>
                                <div className="flex items-center justify-center gap-2 pt-2">
                                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                                    <p className="text-xs text-gray-400">
                                        <span className="font-semibold text-gray-600">{historyTransactions.length}</span> transaksi sudah lunas
                                    </p>
                                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                                </div>
                            </>
                        )
                    )}
                </div>
            </main>

            {/* Modals */}
            {alertModal && <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />}
            {confirmPaymentTx && (
                <ConfirmPaymentModal tx={confirmPaymentTx} onClose={() => setConfirmPaymentTx(null)}
                    onSuccess={() => {
                        const inv = confirmPaymentTx.invoice_number;
                        setAlertModal(`✅ Transaksi ${inv} berhasil dilunasi!`);
                        fetchData();        
                        fetchHistory();    
                        setActiveTab("history"); 
                    }} />
            )}
            {detailTx && <DetailModal tx={detailTx} onClose={() => setDetailTx(null)} />}
        </DashboardLayout>
    );
}