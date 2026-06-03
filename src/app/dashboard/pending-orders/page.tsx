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
        badge: "bg-amber-50 text-amber-700 border-amber-200",
        dot: "bg-amber-400",
        desc: "Sudah bayar DP, belum lunas",
    },
    HELD: {
        label: "Ambil Dulu",
        badge: "bg-blue-50 text-blue-700 border-blue-200",
        dot: "bg-blue-500",
        desc: "Barang dibawa, belum bayar",
    },
} as const;

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
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-xs p-5 text-center">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm font-medium mb-4">{message}</p>
                <button onClick={onClose}
                    className="w-full h-9 bg-[#1a1a2e] text-white rounded-lg text-sm font-medium hover:bg-[#16213e] transition">
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm text-center leading-relaxed mb-4">{message}</p>
                <div className="flex gap-2">
                    <button onClick={onCancel}
                        className="flex-1 h-9 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
                        Batal
                    </button>
                    <button onClick={onConfirm}
                        className="flex-1 h-9 bg-emerald-500 text-white rounded-lg text-sm font-semibold hover:bg-emerald-600 transition">
                        {confirmLabel}
                    </button>
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:mx-4 overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0 bg-emerald-50">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="font-bold text-gray-800 text-base">Konfirmasi Lunas</h2>
                            <p className="text-xs text-gray-500 mt-0.5">{tx.invoice_number}</p>
                        </div>
                    </div>
                    <button onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

                    {/* Info transaksi */}
                    <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100">
                        {[
                            {
                                label: "Status", value: (
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.badge}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} /> {cfg.label}
                                    </span>
                                )
                            },
                            { label: "Customer", value: <span className="text-xs font-semibold text-gray-800">{tx.customer_name}</span> },
                            ...(tx.company_name ? [{ label: "Perusahaan", value: <span className="text-xs text-gray-700">{tx.company_name}</span> }] : []),
                            { label: "Laptop", value: <span className="text-xs font-semibold text-gray-800 text-right max-w-[55%]">{tx.laptop_name}</span> },
                            {
                                label: "Serial Number", value: tx.serial_number
                                    ? <span className="text-xs font-mono bg-gray-200 px-2 py-0.5 rounded text-gray-800 font-semibold">{tx.serial_number}</span>
                                    : <span className="text-xs text-amber-500 font-medium">⚠️ Tidak ada SN</span>
                            },
                            { label: "Harga Deal", value: <span className="text-sm font-bold text-emerald-600">Rp {(tx.deal_price || tx.amount || 0).toLocaleString("id-ID")}</span> },
                        ].map((row, i) => (
                            <div key={i} className="flex items-center justify-between px-4 py-2.5">
                                <span className="text-xs text-gray-400 flex-shrink-0">{row.label}</span>
                                <div>{row.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Upload bukti (file/kamera) */}
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
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
                                <div className="bg-emerald-50 border-t border-emerald-100 px-3 py-1.5 flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <p className="text-xs font-medium text-emerald-700">Foto berhasil diupload</p>
                                </div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingPhoto}
                                className="w-full border-2 border-dashed border-gray-200 rounded-xl py-5 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-600 transition"
                            >
                                {uploadingPhoto ? (
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
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                        <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        <p className="text-xs text-amber-700">
                            Konfirmasi akan mengubah status menjadi <strong>PAID</strong> dan unit menjadi <strong>SOLD</strong>. Tidak dapat dibatalkan.
                        </p>
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                            <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            </svg>
                            <p className="text-xs text-red-700">{error}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
                    <button onClick={onClose} disabled={loading}
                        className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50">
                        Batal
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading || uploadingPhoto}
                        className="flex-1 h-11 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 transition disabled:opacity-40 flex items-center justify-center gap-2"
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
        { label: "Invoice", value: <span className="font-mono text-xs">{tx.invoice_number}</span> },
        {
            label: "Status", value: (
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} /> {cfg.label}
                </span>
            )
        },
        { label: "Customer", value: tx.customer_name },
        { label: "No. HP", value: tx.customer_phone || "—" },
        { label: "Perusahaan", value: tx.company_name || "—" },
        { label: "Laptop", value: tx.laptop_name },
        { label: "Serial Number", value: tx.serial_number ? <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{tx.serial_number}</span> : <span className="text-gray-400 text-xs">Belum ditentukan</span> },
        { label: "Harga Deal", value: <span className="font-semibold text-emerald-600">{fmt(tx.deal_price || tx.amount)}</span> },
        { label: "Metode Bayar", value: tx.payment_method },
        { label: "Platform", value: tx.source_platform || "—" },
        { label: "Sales", value: tx.sales_name },
        { label: "Dibuat", value: fmtDate(tx.created_at) },
        { label: "Catatan", value: tx.notes || "—" },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:mx-4 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                    <div>
                        <h2 className="font-bold text-gray-800 text-base">Detail Transaksi</h2>
                        <p className="text-xs text-gray-400 mt-0.5">{tx.invoice_number}</p>
                    </div>
                    <button onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="overflow-y-auto flex-1 px-5 py-4">
                    <div className="space-y-0 divide-y divide-gray-50">
                        {rows.map(row => (
                            <div key={row.label} className="flex items-start justify-between py-2.5 gap-3">
                                <span className="text-xs text-gray-400 flex-shrink-0 w-28">{row.label}</span>
                                <span className="text-xs text-gray-800 text-right font-medium">{row.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
                    <button onClick={onClose}
                        className="w-full h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">
                        Tutup
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Transaction Card ─────────────────────────────────────────────────────────

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
    const isOld = Date.now() - new Date(tx.created_at).getTime() > 3 * 86_400_000; // > 3 hari

    return (
        <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${isOld ? "border-amber-200" : "border-gray-100"}`}>
            {/* Top stripe */}
            <div className={`h-1 ${tx.status === "RESERVED" ? "bg-amber-400" : "bg-blue-500"}`} />

            <div className="p-4">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-gray-700">{tx.invoice_number}</span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.badge}`}>
                                <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                            </span>
                            {isOld && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200">
                                    ⚠️ {daysSince(tx.created_at)}
                                </span>
                            )}
                        </div>
                        <p className="text-sm font-bold text-gray-800 mt-1 truncate">{tx.customer_name}</p>
                        {tx.customer_phone && (
                            <p className="text-xs text-gray-400">{tx.customer_phone}</p>
                        )}
                    </div>
                    <div className="text-right flex-shrink-0">
                        <p className="text-base font-bold text-emerald-600 tabular-nums">
                            {fmt(tx.deal_price || tx.amount)}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{tx.payment_method}</p>
                    </div>
                </div>

                {/* Laptop info */}
                <div className="bg-gray-50 rounded-lg px-3 py-2 mb-3">
                    <p className="text-xs font-semibold text-gray-700 truncate">{tx.laptop_name}</p>
                    {tx.serial_number ? (
                        <p className="text-[10px] font-mono text-gray-400 mt-0.5">SN: {tx.serial_number}</p>
                    ) : (
                        <p className="text-[10px] text-amber-500 mt-0.5">⏳ SN belum ditentukan</p>
                    )}
                </div>

                {/* Meta */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                            <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        <span className="text-[10px] text-gray-500">{tx.sales_name}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">{fmtDate(tx.created_at)}</span>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                    <button
                        onClick={() => onDetail(tx)}
                        className="flex-1 h-9 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition"
                    >
                        Detail
                    </button>
                    {tx.customer_phone && (
                        <button
                            onClick={() => onWhatsApp(tx)}
                            className="h-9 px-3 bg-green-50 text-green-600 rounded-lg text-xs font-medium hover:bg-green-100 transition flex items-center gap-1.5 border border-green-200"
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                            </svg>
                            WA
                        </button>
                    )}
                    {canConfirm && (
                        <button
                            onClick={() => onConfirm(tx)}
                            className="flex-1 h-9 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 transition flex items-center justify-center gap-1.5"
                        >
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
    return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="h-1 bg-gray-100" />
            <div className="p-4 space-y-3">
                <div className="flex justify-between">
                    <div className="space-y-1.5">
                        <div className="h-3 bg-gray-100 rounded w-28 animate-pulse" />
                        <div className="h-4 bg-gray-100 rounded w-36 animate-pulse" />
                    </div>
                    <div className="h-5 bg-gray-100 rounded w-24 animate-pulse" />
                </div>
                <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                <div className="flex gap-2">
                    <div className="flex-1 h-9 bg-gray-100 rounded-lg animate-pulse" />
                    <div className="flex-1 h-9 bg-gray-100 rounded-lg animate-pulse" />
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

    // Roles yang boleh konfirmasi lunas
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
            <main className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto space-y-5">

                    {/* ── Header ── */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-7 h-7 bg-gradient-to-br from-amber-400 to-amber-500 rounded-lg flex items-center justify-center">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
                                    </svg>
                                </div>
                                <h1 className="text-xl font-bold text-[#1a1a2e] tracking-tight">
                                    DP & Ambil Dulu
                                </h1>
                            </div>
                            <p className="text-xs text-gray-400 ml-9">
                                Transaksi yang belum dilunasi
                            </p>
                        </div>
                        <button
                            onClick={fetchData}
                            disabled={isLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
                        >
                            <svg className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                        </button>
                    </div>

                    {/* ── Stats Cards ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: "Total Pending", value: counts.all, color: "text-gray-800", bg: "bg-white", icon: "📋" },
                            { label: "DP (Reserved)", value: counts.reserved, color: "text-amber-600", bg: "bg-amber-50", icon: "💳" },
                            { label: "Ambil Dulu", value: counts.held, color: "text-blue-600", bg: "bg-blue-50", icon: "📦" },
                            { label: "Total Nilai", value: fmt(totalValue), color: "text-emerald-600", bg: "bg-emerald-50", icon: "💰" },
                        ].map(stat => (
                            <div key={stat.label} className={`${stat.bg} rounded-xl border border-gray-100 shadow-sm p-3`}>
                                <div className="flex items-center justify-between">
                                    <p className="text-xs text-gray-400">{stat.label}</p>
                                    <span className="text-sm opacity-60">{stat.icon}</span>
                                </div>
                                <p className={`text-xl font-bold mt-1 ${stat.color} truncate`}>{stat.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* ── Filter Tabs ── */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-1.5">
                        <div className="flex gap-1.5">
                            {([
                                { value: "ALL", label: "Semua", count: counts.all },
                                { value: "RESERVED", label: "DP", count: counts.reserved },
                                { value: "HELD", label: "Ambil Dulu", count: counts.held },
                            ] as const).map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setFilterStatus(opt.value)}
                                    className={`flex-1 flex flex-col items-center py-2 px-1 rounded-lg text-center transition-all ${filterStatus === opt.value
                                        ? opt.value === "RESERVED"
                                            ? "bg-amber-400 text-white"
                                            : opt.value === "HELD"
                                                ? "bg-blue-500 text-white"
                                                : "bg-[#1a1a2e] text-white"
                                        : "text-gray-500 hover:bg-gray-50"
                                        }`}
                                >
                                    <span className="text-[10px] font-medium opacity-80">{opt.label}</span>
                                    <span className="text-sm font-bold mt-0.5">{opt.count}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Search ── */}
                    <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Cari nama customer, invoice, laptop, no HP..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full h-10 border border-gray-200 rounded-xl pl-9 pr-9 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition shadow-sm"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 transition"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {/* ── Content ── */}
                    {isLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center">
                            <div className="text-4xl mb-3 opacity-40">
                                {transactions.length === 0 ? "🎉" : "🔍"}
                            </div>
                            <p className="text-gray-500 text-sm font-medium">
                                {transactions.length === 0
                                    ? "Tidak ada transaksi pending"
                                    : "Tidak ada hasil untuk pencarian ini"}
                            </p>
                            <p className="text-gray-400 text-xs mt-1">
                                {transactions.length === 0
                                    ? "Semua transaksi sudah dilunasi"
                                    : "Coba ubah kata kunci atau filter"}
                            </p>
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="mt-3 px-4 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition"
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
                            <p className="text-xs text-gray-400 text-center">
                                Menampilkan <span className="font-medium text-gray-600">{filtered.length}</span> dari{" "}
                                <span className="font-medium text-gray-600">{transactions.length}</span> transaksi pending
                            </p>
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