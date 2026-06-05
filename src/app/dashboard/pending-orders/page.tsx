"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingTransaction {
    id: string;
    invoice_number: string;
    status: "RESERVED" | "HELD";
    customer_name: string;
    customer_phone: string | null;
    company_name: string | null;
    laptop_name: string;
    serial_number: string | null;
    unit_id: string | null;
    laptop_id: string | null;
    deal_price: number;
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
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(iso));
}

function daysSince(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return "Hari ini";
    if (days === 1) return "1 hari lalu";
    return `${days} hari lalu`;
}

// ─── Badge configs ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
    RESERVED: {
        label: "DP",
        badge: "bg-gray-100 text-gray-700 border-gray-200",
        dot: "bg-gray-500",
        desc: "Sudah bayar DP, belum lunas",
    },
    HELD: {
        label: "Ambil Dulu",
        badge: "bg-gray-100 text-gray-700 border-gray-200",
        dot: "bg-gray-500",
        desc: "Barang dibawa, belum bayar",
    },
} as const;

// ─── Sub-components dengan tema putih abu-abu ─────────────────────────────────

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
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm font-medium mb-5">{message}</p>
                <button onClick={onClose}
                    className="w-full h-11 bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-all duration-200 shadow-md">
                    OK
                </button>
            </div>
        </div>
    );
}

function ConfirmModal({
    message, onConfirm, onCancel, confirmLabel = "Ya, Konfirmasi",
}: {
    message: string; onConfirm: () => void; onCancel: () => void; confirmLabel?: string;
}) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onCancel]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-scaleIn">
                <div className="bg-gray-700 px-5 py-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="font-bold text-white text-sm">Konfirmasi Tindakan</p>
                            <p className="text-xs text-gray-300 mt-0.5">Aksi ini tidak dapat dibatalkan</p>
                        </div>
                    </div>
                </div>
                <div className="p-5">
                    <p className="text-gray-700 text-sm text-center leading-relaxed mb-6">{message}</p>
                    <div className="flex gap-3">
                        <button onClick={onCancel}
                            className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all duration-200">
                            Batal
                        </button>
                        <button onClick={onConfirm}
                            className="flex-1 h-11 bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-all duration-200 shadow-md">
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ConfirmPaymentModal({
    tx,
    onClose,
    onSuccess,
}: {
    tx: PendingTransaction;
    onClose: () => void;
    onSuccess: () => void;
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
        setUploadingPhoto(true);
        setError("");
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("invoice", tx.invoice_number);
            const res = await fetch("/api/receipt/upload-image", { method: "POST", body: formData });
            const result = await res.json();
            if (result.url) setPaymentPhoto(result.url);
            else throw new Error("URL tidak ditemukan");
        } catch {
            setError("Gagal mengupload foto bukti");
        } finally {
            setUploadingPhoto(false);
        }
    };

    const handleConfirm = async () => {
        setLoading(true);
        setError("");
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
            const result = await res.json();
            if (!result.success) {
                setError(result.message || "Gagal konfirmasi pembayaran");
                return;
            }
            onSuccess();
            onClose();
        } catch {
            setError("Terjadi kesalahan koneksi");
        } finally {
            setLoading(false);
        }
    };

    const cfg = STATUS_CONFIG[tx.status];

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-fadeIn">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:mx-4 overflow-hidden animate-slideUp">

                {/* Header dengan warna abu-abu */}
                <div className="bg-gray-700 px-5 py-4 flex-shrink-0">
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
                        <button onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/20 transition-all duration-200">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Body - scrollable */}
                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

                    {/* Info transaksi */}
                    <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100">
                        {[
                            {
                                label: "Status", value: (
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.badge}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} animate-pulse`} /> {cfg.label}
                                    </span>
                                )
                            },
                            { label: "Customer", value: <span className="text-xs font-semibold text-gray-800">{tx.customer_name}</span> },
                            ...(tx.company_name ? [{ label: "Perusahaan", value: <span className="text-xs text-gray-700">{tx.company_name}</span> }] : []),
                            { label: "Laptop", value: <span className="text-xs font-semibold text-gray-800 text-right max-w-[55%]">{tx.laptop_name}</span> },
                            {
                                label: "Serial Number", value: tx.serial_number
                                    ? <code className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded-md text-gray-800 font-semibold">{tx.serial_number}</code>
                                    : <span className="text-xs text-amber-500 font-medium">⚠️ Tidak ada SN</span>
                            },
                            { label: "Harga Deal", value: <span className="text-sm font-bold text-gray-800">Rp {(tx.deal_price || tx.amount || 0).toLocaleString("id-ID")}</span> },
                        ].map((row, i) => (
                            <div key={i} className="flex items-center justify-between px-4 py-3">
                                <span className="text-xs text-gray-400 flex-shrink-0">{row.label}</span>
                                <div className="text-right">{row.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Upload bukti */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                            Bukti Transfer
                            <span className="text-gray-400 font-normal ml-1">(opsional)</span>
                        </label>

                        {paymentPhoto ? (
                            <div className="relative rounded-xl overflow-hidden border border-gray-200">
                                <img src={paymentPhoto} alt="Bukti bayar" className="w-full max-h-48 object-cover" />
                                <div className="absolute inset-0 bg-black/10 flex items-start justify-end p-2">
                                    <button
                                        onClick={() => { setPaymentPhoto(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                                        className="w-7 h-7 bg-red-500 text-white rounded-lg flex items-center justify-center hover:bg-red-600 transition shadow"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="bg-gray-100 border-t border-gray-200 px-3 py-1.5 flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <p className="text-xs font-medium text-gray-700">Foto berhasil diupload</p>
                                </div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingPhoto}
                                className="w-full border-2 border-dashed border-gray-200 rounded-xl py-6 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-600 transition-all duration-200 group"
                            >
                                {uploadingPhoto ? (
                                    <>
                                        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                                        <span className="text-xs font-medium">Mengupload...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-8 h-8 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        <div className="text-center">
                                            <p className="text-xs font-semibold">Foto Bukti Transfer</p>
                                            <p className="text-[10px] mt-0.5 text-gray-400">Tap untuk buka galeri atau kamera</p>
                                        </div>
                                    </>
                                )}
                            </button>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handlePhotoUpload}
                            className="hidden"
                        />
                    </div>

                    {/* Warning */}
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                        <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        <p className="text-xs text-amber-700">
                            Konfirmasi akan mengubah status menjadi <strong>PAID</strong> dan unit menjadi <strong>SOLD</strong>. Tidak dapat dibatalkan.
                        </p>
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 animate-shake">
                            <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            </svg>
                            <p className="text-xs text-red-700">{error}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0 bg-white">
                    <button onClick={onClose} disabled={loading}
                        className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all duration-200 disabled:opacity-50">
                        Batal
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading || uploadingPhoto}
                        className="flex-1 h-11 bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-all duration-200 disabled:opacity-40 flex items-center justify-center gap-2 shadow-md"
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

function DetailModal({ tx, onClose }: { tx: PendingTransaction; onClose: () => void }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const cfg = STATUS_CONFIG[tx.status];

    const rows: { label: string; value: React.ReactNode }[] = [
        { label: "Invoice", value: <span className="font-mono text-xs font-semibold text-gray-600">{tx.invoice_number}</span> },
        {
            label: "Status", value: (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} animate-pulse`} /> {cfg.label}
                </span>
            )
        },
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
        { label: "Catatan", value: tx.notes || "—" },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-fadeIn">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:mx-4 overflow-hidden animate-slideUp">
                <div className="bg-gray-700 px-5 py-4 flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-bold text-white text-base">Detail Transaksi</h2>
                            <p className="text-xs text-gray-300 mt-0.5">{tx.invoice_number}</p>
                        </div>
                        <button onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/20 transition-all duration-200">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div className="overflow-y-auto flex-1 px-5 py-4">
                    <div className="space-y-0 divide-y divide-gray-100">
                        {rows.map(row => (
                            <div key={row.label} className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-2">
                                <span className="text-xs text-gray-400 font-medium sm:w-28">{row.label}</span>
                                <span className="text-xs text-gray-800 text-left sm:text-right font-medium break-all">{row.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
                    <button onClick={onClose}
                        className="w-full h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all duration-200">
                        Tutup
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Transaction Card dengan tema putih abu-abu ───────────────────────────────

function TransactionCard({
    tx,
    canConfirm,
    onConfirm,
    onDetail,
    onWhatsApp,
}: {
    tx: PendingTransaction;
    canConfirm: boolean;
    onConfirm: (tx: PendingTransaction) => void;
    onDetail: (tx: PendingTransaction) => void;
    onWhatsApp: (tx: PendingTransaction) => void;
}) {
    const cfg = STATUS_CONFIG[tx.status];
    const isOld = Date.now() - new Date(tx.created_at).getTime() > 3 * 86_400_000;

    return (
        <div className={`group bg-white rounded-2xl border shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden ${isOld ? "border-amber-200" : "border-gray-100"} animate-fadeUp`}>
            {/* Top stripe */}
            <div className={`h-1 ${tx.status === "RESERVED" ? "bg-gray-500" : "bg-gray-500"}`} />

            <div className="p-4 sm:p-5">
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <code className="font-mono text-xs font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
                                {tx.invoice_number}
                            </code>
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${cfg.badge}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} animate-pulse`} />
                                {cfg.label}
                            </span>
                            {isOld && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200">
                                    ⚠️ {daysSince(tx.created_at)}
                                </span>
                            )}
                        </div>
                        <p className="text-base font-bold text-gray-800 mt-2 truncate">{tx.customer_name}</p>
                        {tx.customer_phone && (
                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                                </svg>
                                {tx.customer_phone}
                            </p>
                        )}
                    </div>
                    <div className="text-right flex-shrink-0">
                        <p className="text-lg font-bold text-gray-800 tabular-nums">
                            {fmt(tx.deal_price || tx.amount)}
                        </p>
                        <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full mt-1 inline-block">
                            {tx.payment_method}
                        </span>
                    </div>
                </div>

                {/* Laptop info */}
                <div className="bg-gray-50 rounded-xl px-3 py-2.5 mb-4">
                    <p className="text-sm font-semibold text-gray-800 truncate">{tx.laptop_name}</p>
                    {tx.serial_number ? (
                        <div className="flex items-center gap-1 mt-1">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <code className="text-[11px] font-mono text-gray-500">SN: {tx.serial_number}</code>
                        </div>
                    ) : (
                        <p className="text-[11px] text-amber-500 flex items-center gap-1 mt-1">
                            <span>⚠️</span> SN belum ditentukan
                        </p>
                    )}
                </div>

                {/* Meta info */}
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                            <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        <span className="text-[11px] font-medium text-gray-500">{tx.sales_name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <span className="text-[10px] text-gray-400">{fmtDate(tx.created_at)}</span>
                    </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                        onClick={() => onDetail(tx)}
                        className="h-9 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-200 transition-all duration-200 flex items-center justify-center gap-1.5 group/btn"
                    >
                        <svg className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        Detail
                    </button>
                    {tx.customer_phone && (
                        <button
                            onClick={() => onWhatsApp(tx)}
                            className="h-9 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-200 transition-all duration-200 flex items-center justify-center gap-1.5 border border-gray-200 group/btn"
                        >
                            <svg className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                            </svg>
                            WA
                        </button>
                    )}
                    {canConfirm && (
                        <button
                            onClick={() => onConfirm(tx)}
                            className="h-9 bg-gray-700 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition-all duration-200 flex items-center justify-center gap-1.5 shadow-md group/btn"
                        >
                            <svg className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PendingOrdersPage() {
    const [transactions, setTransactions] = useState<PendingTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<"ALL" | "RESERVED" | "HELD">("ALL");
    const [searchQuery, setSearchQuery] = useState("");

    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const [alertModal, setAlertModal] = useState<string | null>(null);
    const [confirmPaymentTx, setConfirmPaymentTx] = useState<PendingTransaction | null>(null);
    const [detailTx, setDetailTx] = useState<PendingTransaction | null>(null);

    const canConfirm = userRole
        ? (["ADMIN", "KEPALA_SALES", "CREW_SALES"] as UserRole[]).includes(userRole)
        : false;

    useEffect(() => {
        fetch("/api/auth/me")
            .then(r => r.json())
            .then(r => setUserRole(r.user?.role ?? null))
            .catch(() => setUserRole(null));
    }, []);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/transaction/pending");
            const result = await res.json();
            if (result.success) setTransactions(result.data || []);
        } catch {
            // ignore
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

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

    // ── Filtered data ──
    const filtered = transactions.filter(tx => {
        if (filterStatus !== "ALL" && tx.status !== filterStatus) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
                tx.customer_name.toLowerCase().includes(q) ||
                tx.invoice_number.toLowerCase().includes(q) ||
                tx.laptop_name.toLowerCase().includes(q) ||
                (tx.serial_number || "").toLowerCase().includes(q) ||
                (tx.customer_phone || "").includes(q)
            );
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
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.9); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes slideUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes fadeUp {
                    from { opacity: 0; transform: translateY(15px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                @keyframes bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
                .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
                .animate-scaleIn { animation: scaleIn 0.25s ease-out; }
                .animate-slideUp { animation: slideUp 0.3s ease-out; }
                .animate-fadeUp { animation: fadeUp 0.4s ease-out; }
                .animate-shake { animation: shake 0.3s ease-in-out; }
                .animate-bounce { animation: bounce 1s ease-in-out infinite; }
            `}</style>

            <main className="min-h-screen bg-white p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto space-y-5">

                    {/* ── Header ── */}
                    <div className="flex flex-wrap items-start justify-between gap-3 animate-slideIn">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-1 h-7 bg-gradient-to-b from-gray-600 to-gray-800 rounded-full" />
                                <div className="w-7 h-7 bg-gradient-to-br from-gray-600 to-gray-800 rounded-lg flex items-center justify-center shadow-md">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
                                    </svg>
                                </div>
                                <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-900 bg-clip-text text-transparent">
                                    DP & Ambil Dulu
                                </h1>
                            </div>
                            <p className="text-sm text-gray-500 ml-10">
                                Transaksi yang belum dilunasi — <span className="text-gray-600 font-medium">Perlu tindakan</span>
                            </p>
                        </div>
                        <button
                            onClick={fetchData}
                            disabled={isLoading}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 shadow-sm group"
                        >
                            <svg className={`w-4 h-4 ${isLoading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                        </button>
                    </div>

                    {/* ── Stats Cards ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fadeUp" style={{ animationDelay: "0.05s" }}>
                        {[
                            { label: "Total Pending", value: counts.all, color: "text-gray-800", bg: "bg-white", icon: "📋", bar: "bg-gray-500" },
                            { label: "DP (Reserved)", value: counts.reserved, color: "text-gray-700", bg: "bg-gray-50", icon: "💳", bar: "bg-gray-500" },
                            { label: "Ambil Dulu", value: counts.held, color: "text-gray-700", bg: "bg-gray-50", icon: "📦", bar: "bg-gray-500" },
                            { label: "Total Nilai", value: fmt(totalValue), color: "text-gray-800", bg: "bg-gray-100", icon: "💰", bar: "bg-gray-600" },
                        ].map(stat => (
                            <div key={stat.label} className={`${stat.bg} rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-4 relative overflow-hidden group`}>
                                <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${stat.bar} opacity-60 group-hover:opacity-100 transition-opacity`} />
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{stat.label}</p>
                                    <span className="text-lg opacity-60 group-hover:opacity-100 transition-opacity">{stat.icon}</span>
                                </div>
                                <p className={`text-2xl font-extrabold mt-1 ${stat.color} group-hover:scale-105 transition-transform origin-left`}>{stat.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* ── Filter Tabs ── */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5 animate-fadeUp" style={{ animationDelay: "0.08s" }}>
                        <div className="grid grid-cols-3 gap-1.5">
                            {([
                                { value: "ALL", label: "Semua", count: counts.all, icon: "📋" },
                                { value: "RESERVED", label: "DP", count: counts.reserved, icon: "💳" },
                                { value: "HELD", label: "Ambil Dulu", count: counts.held, icon: "📦" },
                            ] as const).map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setFilterStatus(opt.value)}
                                    className={`flex flex-col items-center py-2.5 px-2 rounded-xl text-center transition-all duration-200 ${
                                        filterStatus === opt.value
                                            ? "bg-gray-700 text-white shadow-md transform scale-105"
                                            : "text-gray-500 hover:bg-gray-50"
                                    }`}
                                >
                                    <span className="text-lg">{opt.icon}</span>
                                    <span className="text-[10px] font-medium mt-0.5">{opt.label}</span>
                                    <span className={`text-sm font-bold mt-0.5 ${filterStatus === opt.value ? "text-white" : "text-gray-700"}`}>
                                        {opt.count}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Search ── */}
                    <div className="relative group animate-fadeUp" style={{ animationDelay: "0.1s" }}>
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-gray-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Cari nama customer, invoice, laptop, atau no HP..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full h-11 border border-gray-200 rounded-xl pl-9 pr-9 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 transition-all duration-200 shadow-sm"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all duration-200"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {/* ── Content ── */}
                    {isLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center animate-fadeIn">
                            <div className="text-6xl mb-4 animate-bounce">
                                {transactions.length === 0 ? "🎉" : "🔍"}
                            </div>
                            <p className="text-gray-500 font-semibold text-base">
                                {transactions.length === 0
                                    ? "Tidak ada transaksi pending"
                                    : "Tidak ada hasil untuk pencarian ini"}
                            </p>
                            <p className="text-gray-400 text-sm mt-2">
                                {transactions.length === 0
                                    ? "Semua transaksi sudah dilunasi"
                                    : "Coba ubah kata kunci atau filter"}
                            </p>
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="mt-4 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all duration-200"
                                >
                                    Hapus pencarian
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filtered.map(tx => (
                                    <TransactionCard
                                        key={tx.id}
                                        tx={tx}
                                        canConfirm={canConfirm}
                                        onConfirm={setConfirmPaymentTx}
                                        onDetail={setDetailTx}
                                        onWhatsApp={handleWhatsApp}
                                    />
                                ))}
                            </div>
                            <div className="flex items-center justify-center gap-2 pt-2">
                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                                <p className="text-xs text-gray-400">
                                    Menampilkan <span className="font-semibold text-gray-600">{filtered.length}</span> dari{" "}
                                    <span className="font-semibold text-gray-600">{transactions.length}</span> transaksi
                                </p>
                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                            </div>
                        </>
                    )}
                </div>
            </main>

            {/* ── Modals ── */}
            {alertModal && <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />}

            {confirmPaymentTx && (
                <ConfirmPaymentModal
                    tx={confirmPaymentTx}
                    onClose={() => setConfirmPaymentTx(null)}
                    onSuccess={() => {
                        setAlertModal(`✅ Transaksi ${confirmPaymentTx.invoice_number} berhasil dilunasi!`);
                        fetchData();
                    }}
                />
            )}

            {detailTx && (
                <DetailModal
                    tx={detailTx}
                    onClose={() => setDetailTx(null)}
                />
            )}
        </DashboardLayout>
    );
}