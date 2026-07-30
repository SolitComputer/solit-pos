"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, hasPermission, PERMISSIONS } from "@/lib/permissions";
import { CreditCard, Package, AlertTriangle, CheckCircle2, Clock, Search, PartyPopper, Inbox, RefreshCw, Ban } from "lucide-react";

interface PendingTransaction {
    id: string;
    invoice_number: string;
    status: "RESERVED" | "HELD" | "PENDING" | "PAID";
    sales_id: string;
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

function fmtDateShort(iso: string) {
    if (!iso) return "—";
    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit", month: "short",
        hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
}

function daysSince(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return "Hari ini";
    if (days === 1) return "1 hari";
    return `${days} hari`;
}

function getOriginalStatus(tx: PendingTransaction): "RESERVED" | "HELD" | null {
    if (tx.status !== "PAID") return null;
    if (tx.dp_amount && tx.dp_amount > 0) return "RESERVED";
    if (tx.paid_at && tx.created_at) {
        const diffMs = new Date(tx.paid_at).getTime() - new Date(tx.created_at).getTime();
        if (diffMs > 60 * 60 * 1000) return "HELD";
    }
    return null;
}

// ─── AlertModal ───────────────────────────────────────────────────────────────
function AlertModal({ message, onClose }: { message: string; onClose: () => void }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 anim-fade">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center anim-pop">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm font-medium mb-5">{message}</p>
                <button onClick={onClose} className="w-full h-10 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 transition">OK</button>
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
        : (tx.status === "RESERVED" ? "DP" : tx.status === "HELD" ? "Ambil Dulu" : tx.status);

    const rows: { label: string; value: React.ReactNode }[] = [
        { label: "Invoice", value: <span className="font-mono text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{tx.invoice_number}</span> },
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center anim-fade">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:mx-4 overflow-hidden anim-slide-up">
                <div className="bg-gray-800 px-5 py-4 shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-bold text-white text-sm">Detail Transaksi</h2>
                            <p className="text-xs text-gray-400 mt-0.5 font-mono">{tx.invoice_number}</p>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div className="overflow-y-auto flex-1 px-5 py-3">
                    <div className="divide-y divide-gray-100">
                        {rows.map(row => (
                            <div key={row.label} className="flex flex-col sm:flex-row sm:items-center justify-between py-2.5 gap-1">
                                <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide sm:w-28 shrink-0">{row.label}</span>
                                <span className="text-xs text-gray-800 sm:text-right font-medium break-all">{row.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="px-5 py-3 border-t border-gray-100 shrink-0">
                    <button onClick={onClose} className="w-full h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Tutup</button>
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
    const [payMode, setPayMode] = useState<"LUNAS" | "CICILAN">("LUNAS");
    const [cicilanAmount, setCicilanAmount] = useState("");

    const dealTotal = Number(tx.deal_price || tx.amount || 0);
    const paidSoFar = Number(tx.dp_amount || 0);
    const remaining = Math.max(0, dealTotal - paidSoFar);
    const showCicilanForm = payMode === "CICILAN";

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingPhoto(true);
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
        if (showCicilanForm) {
            const amt = Number(cicilanAmount);
            if (!amt || amt <= 0) { setError("Nominal cicilan wajib diisi"); return; }
            setLoading(true); setError("");
            try {
                const res = await fetch("/api/units/confirm-payment", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        invoice_number: tx.invoice_number,
                        amount: amt,
                        is_partial: true,
                    }),
                });
                const r = await res.json();
                if (!r.success) { setError(r.message || "Gagal"); return; }
                onSuccess(); onClose();
            } catch { setError("Terjadi kesalahan koneksi"); }
            finally { setLoading(false); }
            return;
        }

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

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center anim-fade">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:mx-4 overflow-hidden anim-slide-up">
                <div className="bg-gray-800 px-5 py-4 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="font-bold text-white text-sm">Pembayaran</h2>
                                <p className="text-xs text-gray-400 font-mono mt-0.5">{tx.invoice_number}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                    {/* Info rows */}
                    <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                        {[
                            { label: "Status", value: <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${tx.status === "RESERVED" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-orange-50 text-orange-700 border-orange-200"}`}>{tx.status === "RESERVED" ? <><CreditCard size={12} /> DP</> : <><Package size={12} /> Ambil Dulu</>}</span> },
                            { label: "Customer", value: <span className="text-xs font-semibold text-gray-800">{tx.customer_name}</span> },
                            { label: "Laptop", value: <span className="text-xs font-semibold text-gray-800 truncate max-w-[180px] block">{tx.laptop_name}</span> },
                            { label: "Harga Deal", value: <span className="text-sm font-bold text-gray-800">{fmt(dealTotal)}</span> },
                        ].map((row, i) => (
                            <div key={i} className="flex items-center justify-between px-4 py-2.5">
                                <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">{row.label}</span>
                                <div>{row.value}</div>
                            </div>
                        ))}
                    </div>

                    {paidSoFar > 0 && (
                        <div className="bg-gray-50 rounded-xl border border-gray-200 grid grid-cols-2 gap-3 px-4 py-3">
                            <div>
                                <p className="text-[10px] text-gray-400 font-semibold uppercase">Sudah Dibayar</p>
                                <p className="text-sm font-bold text-blue-700">{fmt(paidSoFar)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-400 font-semibold uppercase">Sisa Tagihan</p>
                                <p className="text-sm font-bold text-red-600">{fmt(remaining)}</p>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setPayMode("CICILAN")}
                            className={`h-10 rounded-xl text-sm font-semibold border transition ${payMode === "CICILAN" ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                            Cicilan
                        </button>
                        <button type="button" onClick={() => setPayMode("LUNAS")}
                            className={`h-10 rounded-xl text-sm font-semibold border transition ${payMode === "LUNAS" ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                            Lunas Sekarang
                        </button>
                    </div>

                    {showCicilanForm ? (
                        <div className="space-y-1.5">
                            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide">Nominal Cicilan</label>
                            <input
                                type="number" value={cicilanAmount}
                                onChange={(e) => { setCicilanAmount(e.target.value); setError(""); }}
                                placeholder={`Kurang dari ${fmt(remaining)}`}
                                className="w-full h-11 border border-gray-300 rounded-xl px-3 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:bg-white transition"
                                autoFocus
                            />
                            <p className="text-[11px] text-gray-400">Sisa setelah cicilan ini: {fmt(Math.max(0, remaining - (Number(cicilanAmount) || 0)))}</p>
                        </div>
                    ) : (
                        <>
                            {/* SN — hanya relevan buat status RESERVED tanpa SN */}
                            {tx.status === "RESERVED" && !tx.serial_number && (
                                <div className="flex items-center gap-1 text-xs text-amber-500 font-medium px-1">
                                    <AlertTriangle size={12} /> Unit belum ada SN — pastikan sudah diisi sebelum lunas
                                </div>
                            )}

                            {/* Upload bukti */}
                            <div>
                                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                                    Bukti Transfer <span className="text-gray-400 normal-case font-normal">(opsional)</span>
                                </label>
                                {paymentPhoto ? (
                                    <div className="relative rounded-xl overflow-hidden border border-gray-200">
                                        <img src={paymentPhoto} alt="Bukti bayar" className="w-full max-h-40 object-cover" />
                                        <button onClick={() => { setPaymentPhoto(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                                            className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-lg flex items-center justify-center hover:bg-red-600 transition shadow">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                        <div className="bg-gray-50 border-t border-gray-100 px-3 py-1.5">
                                            <p className="inline-flex items-center gap-1 text-xs font-medium text-gray-600"><CheckCircle2 size={12} className="text-emerald-600" /> Foto berhasil diupload</p>
                                        </div>
                                    </div>
                                ) : (
                                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}
                                        className="w-full border-2 border-dashed border-gray-200 rounded-xl py-5 flex flex-col items-center justify-center gap-1.5 text-gray-400 hover:border-gray-300 hover:bg-gray-50 transition">
                                        {uploadingPhoto ? (
                                            <><div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" /><span className="text-xs">Mengupload...</span></>
                                        ) : (
                                            <><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg><span className="text-xs font-medium">Upload Foto Bukti</span></>
                                        )}
                                    </button>
                                )}
                                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoUpload} className="hidden" />
                            </div>

                            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                                <svg className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                </svg>
                                <p className="text-xs text-amber-700">Konfirmasi akan mengubah status menjadi <strong>PAID</strong> dan unit menjadi <strong>SOLD</strong>. Tidak dapat dibatalkan.</p>
                            </div>
                        </>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700 anim-shake">{error}</div>
                    )}
                </div>

                <div className="px-5 py-3 border-t border-gray-100 flex gap-2.5 shrink-0">
                    <button onClick={onClose} disabled={loading} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50">Batal</button>
                    <button onClick={handleConfirm} disabled={loading || uploadingPhoto}
                        className="flex-1 h-10 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 transition disabled:opacity-40 flex items-center justify-center gap-2 shadow-md">
                        {loading
                            ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Memproses...</>
                            : showCicilanForm
                                ? "Simpan Cicilan"
                                : <><CheckCircle2 size={16} /> Konfirmasi Lunas</>
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── CancelModal (Tidak Jadi) ─────────────────────────────────────────────────
function CancelModal({ tx, cancelling, onConfirm, onClose }: {
    tx: PendingTransaction; cancelling: boolean; onConfirm: () => void; onClose: () => void;
}) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center anim-fade">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:mx-4 overflow-hidden anim-slide-up">
                <div className="bg-red-600 px-5 py-4 shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-bold text-white text-sm">Batalkan Pesanan (Tidak Jadi)</h2>
                            <p className="text-xs text-white/70 mt-0.5 font-mono">{tx.invoice_number}</p>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800">
                        <p className="font-bold mb-1 leading-relaxed text-sm">
                            Batalkan pesanan untuk <span className="underline">{tx.customer_name}</span>?
                        </p>
                    </div>
                    <div className="space-y-1.5 text-xs text-gray-600 bg-gray-50 rounded-xl p-3.5 border border-gray-200">
                        <p className="font-semibold text-gray-700 mb-2">Yang akan terjadi:</p>
                        <p>• Status → <span className="font-bold text-red-600">BATAL (Tidak Jadi)</span></p>
                        <p>• Unit <span className="font-semibold">{tx.laptop_name}</span> kembali ke stok <span className="font-bold text-emerald-700">Siap Jual</span> di Data Barang</p>
                        <p>• Otomatis hilang dari daftar DP &amp; Ambil Dulu</p>
                        <p>• Tercatat di Riwayat Transaksi dengan status <span className="font-bold text-red-600">Batal</span></p>
                        {tx.status === "RESERVED" && (
                            <p className="text-amber-700 font-semibold pt-1"> DP yang sudah dibayar diurus manual (tidak otomatis dikembalikan sistem)</p>
                        )}
                    </div>
                </div>
                <div className="px-5 py-3 border-t border-gray-100 flex gap-2.5 shrink-0">
                    <button onClick={onClose} disabled={cancelling} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50">Batal</button>
                    <button onClick={onConfirm} disabled={cancelling} className="flex-1 h-10 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition disabled:opacity-60">
                        {cancelling ? "Memproses..." : "Ya, Tidak Jadi"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: "RESERVED" | "HELD" | "PENDING" }) {
    if (status === "RESERVED") {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                <CreditCard size={12} /> DP
            </span>
        );
    }
    if (status === "PENDING") {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                <Clock size={12} /> Pending
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-200 whitespace-nowrap">
            <Package size={12} /> Ambil
        </span>
    );
}

// ─── Table row for PENDING ────────────────────────────────────────────────────
function PendingRow({ tx, canConfirm, canCancel, onConfirm, onCancel, onDetail, onWhatsApp, idx }: {
    tx: PendingTransaction;
    canConfirm: boolean;
    canCancel: boolean;
    onConfirm: (tx: PendingTransaction) => void;
    onCancel: (tx: PendingTransaction) => void;
    onDetail: (tx: PendingTransaction) => void;
    onWhatsApp: (tx: PendingTransaction) => void;
    idx: number;
}) {
    const isOld = Date.now() - new Date(tx.created_at).getTime() > 3 * 86_400_000;
    const age = daysSince(tx.created_at);

    return (
        <tr className={`group border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors duration-100 ${isOld ? "bg-amber-50/30 hover:bg-amber-50/60" : ""}`}>
            {/* No */}
            <td className="pl-4 pr-2 py-2.5 text-center">
                <span className="text-[11px] font-semibold text-gray-300 tabular-nums">{String(idx + 1).padStart(2, "0")}</span>
            </td>

            {/* Invoice + status */}
            <td className="px-3 py-2.5 min-w-[140px]">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusBadge status={tx.status as "RESERVED" | "HELD" | "PENDING"} />
                    {isOld && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-red-50 text-red-500 border border-red-200">
                            <AlertTriangle size={12} /> {age}
                        </span>
                    )}
                </div>
                <code className="text-[11px] font-mono text-gray-500 mt-0.5 block leading-tight">{tx.invoice_number}</code>
            </td>

            {/* Customer */}
            <td className="px-3 py-2.5 min-w-[130px]">
                <p className="text-xs font-semibold text-gray-800 truncate max-w-[150px]">{tx.customer_name}</p>
                {tx.customer_phone && (
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">{tx.customer_phone}</p>
                )}
            </td>

            {/* Laptop */}
            <td className="px-3 py-2.5 min-w-[160px]">
                <p className="text-xs font-medium text-gray-700 truncate max-w-[200px]" title={tx.laptop_name}>{tx.laptop_name}</p>
                {tx.serial_number
                    ? <code className="text-[10px] font-mono text-gray-400 mt-0.5 block">SN: {tx.serial_number}</code>
                    : <p className="inline-flex items-center gap-1 text-[10px] text-amber-500 mt-0.5"><AlertTriangle size={11} /> SN belum ada</p>
                }
            </td>

            {/* Harga */}
            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                <span className="text-xs font-bold text-gray-800 tabular-nums">{fmt(tx.deal_price || tx.amount)}</span>
                <p className="text-[10px] text-gray-400 mt-0.5">{tx.payment_method}</p>
            </td>

            {/* Sales + tanggal */}
            <td className="px-3 py-2.5 hidden lg:table-cell min-w-[110px]">
                <p className="text-[11px] text-gray-600 font-medium truncate">{tx.sales_name}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{fmtDateShort(tx.created_at)}</p>
            </td>

            {/* Actions */}
            <td className="pl-2 pr-4 py-2.5">
                <div className="flex items-center justify-end gap-1">
                    <button onClick={() => onDetail(tx)}
                        title="Detail"
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                    </button>
                    {tx.customer_phone && (
                        <button onClick={() => onWhatsApp(tx)}
                            title="WhatsApp"
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-all">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                            </svg>
                        </button>
                    )}
                    {canConfirm && (
                        <button onClick={() => onConfirm(tx)}
                            title="Konfirmasi Lunas"
                            className="h-7 px-2.5 flex items-center gap-1 rounded-lg text-[11px] font-bold text-white bg-gray-700 hover:bg-gray-800 transition-all shadow-sm">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            Lunas
                        </button>
                    )}
                    {canCancel && (
                        <button onClick={() => onCancel(tx)}
                            title="Tidak Jadi — batalkan pesanan"
                            className="h-7 px-2.5 flex items-center gap-1 rounded-lg text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-all">
                            <Ban size={12} />
                            Tidak Jadi
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
}

// ─── Table row for HISTORY ────────────────────────────────────────────────────
function HistoryRow({ tx, onDetail, onWhatsApp, idx }: {
    tx: PendingTransaction;
    onDetail: (tx: PendingTransaction) => void;
    onWhatsApp: (tx: PendingTransaction) => void;
    idx: number;
}) {
    const originalStatus = getOriginalStatus(tx) ?? "HELD";

    return (
        <tr className="group border-b border-gray-50 last:border-0 hover:bg-emerald-50/40 transition-colors duration-100">
            {/* No */}
            <td className="pl-4 pr-2 py-2.5 text-center">
                <span className="text-[11px] font-semibold text-gray-300 tabular-nums">{String(idx + 1).padStart(2, "0")}</span>
            </td>

            {/* Invoice + asal status */}
            <td className="px-3 py-2.5 min-w-[150px]">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${originalStatus === "RESERVED" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-orange-50 text-orange-700 border-orange-200"}`}>
                        {originalStatus === "RESERVED" ? <><CreditCard size={12} /> DP</> : <><Package size={12} /> Ambil</>}
                    </span>
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 size={12} /> Lunas
                    </span>
                </div>
                <code className="text-[11px] font-mono text-gray-500 mt-0.5 block leading-tight">{tx.invoice_number}</code>
            </td>

            {/* Customer */}
            <td className="px-3 py-2.5 min-w-[130px]">
                <p className="text-xs font-semibold text-gray-800 truncate max-w-[150px]">{tx.customer_name}</p>
                {tx.customer_phone && (
                    <p className="text-[11px] text-gray-400 mt-0.5">{tx.customer_phone}</p>
                )}
            </td>

            {/* Laptop */}
            <td className="px-3 py-2.5 min-w-[160px]">
                <p className="text-xs font-medium text-gray-700 truncate max-w-[200px]" title={tx.laptop_name}>{tx.laptop_name}</p>
                {tx.serial_number && <code className="text-[10px] font-mono text-gray-400 mt-0.5 block">SN: {tx.serial_number}</code>}
            </td>

            {/* Harga */}
            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                <span className="text-xs font-bold text-gray-800 tabular-nums">{fmt(tx.deal_price || tx.amount)}</span>
                <p className="text-[10px] text-gray-400 mt-0.5">{tx.payment_method}</p>
            </td>

            {/* Lunas at */}
            <td className="px-3 py-2.5 hidden lg:table-cell min-w-[120px]">
                {tx.paid_at ? (
                    <>
                        <p className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold"><CheckCircle2 size={11} /> {fmtDateShort(tx.paid_at)}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Order: {fmtDateShort(tx.created_at)}</p>
                    </>
                ) : (
                    <p className="text-[11px] text-gray-400">—</p>
                )}
            </td>

            {/* Actions */}
            <td className="pl-2 pr-4 py-2.5">
                <div className="flex items-center justify-end gap-1">
                    <button onClick={() => onDetail(tx)} title="Detail"
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                    </button>
                    {tx.customer_phone && (
                        <button onClick={() => onWhatsApp(tx)} title="WhatsApp"
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-all">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                            </svg>
                        </button>
                    )}
                    <a href={`/receipt/${tx.invoice_number}`} target="_blank" rel="noreferrer"
                        title="Receipt"
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </a>
                </div>
            </td>
        </tr>
    );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────
function SkeletonRows({ count = 8 }: { count?: number }) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0 animate-pulse">
                    <td className="pl-4 pr-2 py-3"><div className="h-3 w-5 bg-gray-100 rounded mx-auto" /></td>
                    <td className="px-3 py-3">
                        <div className="h-4 w-20 bg-gray-100 rounded mb-1.5" />
                        <div className="h-3 w-28 bg-gray-100 rounded" />
                    </td>
                    <td className="px-3 py-3">
                        <div className="h-3.5 w-24 bg-gray-100 rounded mb-1.5" />
                        <div className="h-3 w-20 bg-gray-100 rounded" />
                    </td>
                    <td className="px-3 py-3">
                        <div className="h-3.5 w-36 bg-gray-100 rounded mb-1.5" />
                        <div className="h-3 w-24 bg-gray-100 rounded" />
                    </td>
                    <td className="px-3 py-3 text-right">
                        <div className="h-3.5 w-20 bg-gray-100 rounded ml-auto mb-1.5" />
                        <div className="h-3 w-12 bg-gray-100 rounded ml-auto" />
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                        <div className="h-3 w-20 bg-gray-100 rounded mb-1.5" />
                        <div className="h-3 w-16 bg-gray-100 rounded" />
                    </td>
                    <td className="pl-2 pr-4 py-3">
                        <div className="flex gap-1 justify-end">
                            <div className="h-7 w-7 bg-gray-100 rounded-lg" />
                            <div className="h-7 w-7 bg-gray-100 rounded-lg" />
                            <div className="h-7 w-14 bg-gray-100 rounded-lg" />
                        </div>
                    </td>
                </tr>
            ))}
        </>
    );
}

// ─── TABLE HEADER ─────────────────────────────────────────────────────────────
function TableHead({ isHistory }: { isHistory?: boolean }) {
    return (
        <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="pl-4 pr-2 py-2.5 text-center w-8">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">#</span>
                </th>
                <th className="px-3 py-2.5 text-left">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status / Invoice</span>
                </th>
                <th className="px-3 py-2.5 text-left">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Customer</span>
                </th>
                <th className="px-3 py-2.5 text-left">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Laptop</span>
                </th>
                <th className="px-3 py-2.5 text-right">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Harga</span>
                </th>
                <th className="px-3 py-2.5 text-left hidden lg:table-cell">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{isHistory ? "Tgl Lunas" : "Sales / Tgl"}</span>
                </th>
                <th className="pl-2 pr-4 py-2.5 text-right">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Aksi</span>
                </th>
            </tr>
        </thead>
    );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function PendingOrdersPage() {
    const [transactions, setTransactions] = useState<PendingTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<"ALL" | "RESERVED" | "HELD" | "PENDING">("ALL");
    const [searchQuery, setSearchQuery] = useState("");
    const [minSisa, setMinSisa] = useState("");
    const [maxSisa, setMaxSisa] = useState("");

    const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");
    const [historyTransactions, setHistoryTransactions] = useState<PendingTransaction[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const [alertModal, setAlertModal] = useState<string | null>(null);
    const [confirmPaymentTx, setConfirmPaymentTx] = useState<PendingTransaction | null>(null);
    const [detailTx, setDetailTx] = useState<PendingTransaction | null>(null);
    const [cancelTx, setCancelTx] = useState<PendingTransaction | null>(null);
    const [cancelling, setCancelling] = useState(false);

    const [userId, setUserId] = useState<string | null>(null);
    // Reuse permission yang sama dengan tombol "Restore/Batal" di halaman Riwayat Transaksi
    const canCancel = userRole ? hasPermission(userRole, PERMISSIONS.RESTORE_TRANSACTION) : false;

    useEffect(() => {
        fetch("/api/auth/me").then(r => r.json()).then(r => {
            setUserRole(r.user?.role ?? null);
            setUserId(r.user?.id ?? null);
        }).catch(() => { setUserRole(null); setUserId(null); });
    }, []);

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
                    if (tx.dp_amount && tx.dp_amount > 0) return true;
                    if (tx.paid_at && tx.created_at) {
                        const diffMs = new Date(tx.paid_at).getTime() - new Date(tx.created_at).getTime();
                        return diffMs > 5 * 60 * 1000;
                    }
                    return false;
                });
                setHistoryTransactions(paid);
            }
        } catch { /* ignore */ }
        finally { setIsLoadingHistory(false); }
    }, []);

    useEffect(() => {
        if (activeTab === "history" && historyTransactions.length === 0) {
            fetchHistory();
        }
    }, [activeTab]);

    const handleCancelConfirm = async () => {
        if (!cancelTx) return;
        setCancelling(true);
        try {
            // Endpoint sama persis dengan tombol "Restore/Batal" di halaman Riwayat Transaksi
            const res = await fetch(`/api/transaction/${cancelTx.invoice_number}/restore`, { method: "POST" });
            const result = await res.json();
            if (!result.success) {
                setAlertModal("Gagal membatalkan: " + (result.message || "Terjadi kesalahan"));
                return;
            }
            setAlertModal(`Pesanan ${cancelTx.invoice_number} berhasil ditandai Tidak Jadi. Unit sudah kembali ke stok Siap Jual.`);
            setCancelTx(null);
            fetchData();
        } catch {
            setAlertModal("Terjadi kesalahan koneksi saat membatalkan pesanan");
        } finally {
            setCancelling(false);
        }
    };

    const handleWhatsApp = (tx: PendingTransaction) => {
        if (!tx.customer_phone) return;
        const phone = tx.customer_phone.replace(/\D/g, "").replace(/^0/, "62");
        const statusLabel = tx.status === "RESERVED" ? "DP" : "Ambil Dulu";
        const message = [
            `Halo *${tx.customer_name}*,`,
            ``,
            `Kami ingin mengingatkan mengenai transaksi *${statusLabel}* berikut:`,
            ``,
            `Invoice: *${tx.invoice_number}*`,
            `Laptop: *${tx.laptop_name}*`,
            `Harga Deal: *${fmt(tx.deal_price || tx.amount)}*`,
            ``,
            `Mohon segera lakukan pelunasan. Terima kasih!`,
            ``,
            `— *Solit*`,
        ].join("\n");
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
    };

    const filtered = transactions.filter(tx => {
        if (filterStatus !== "ALL" && tx.status !== filterStatus) return false;
        const sisa = (tx.deal_price || tx.amount || 0) - (tx.dp_amount || 0);
        if (minSisa && sisa < Number(minSisa)) return false;
        if (maxSisa && sisa > Number(maxSisa)) return false;
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
        pending: transactions.filter(t => t.status === "PENDING").length,
    };

    const totalValue = filtered.reduce((sum, tx) => sum + (tx.deal_price || tx.amount || 0), 0);

    return (
        <DashboardLayout>
            <style>{`
                @keyframes anim-fade  { from{opacity:0;transform:scale(0.97)} to{opacity:1;transform:scale(1)} }
                @keyframes anim-pop   { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
                @keyframes anim-slide-up { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
                @keyframes anim-shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
                .anim-fade      { animation: anim-fade      0.2s ease-out; }
                .anim-pop       { animation: anim-pop       0.2s cubic-bezier(.34,1.56,.64,1); }
                .anim-slide-up  { animation: anim-slide-up  0.28s ease-out; }
                .anim-shake     { animation: anim-shake     0.3s ease-in-out; }

                .tbl-scroll {
                    scrollbar-width: thin;
                    scrollbar-color: #e5e7eb #f9fafb;
                }
                .tbl-scroll::-webkit-scrollbar { height: 5px; }
                .tbl-scroll::-webkit-scrollbar-track { background: #f9fafb; }
                .tbl-scroll::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 99px; }
            `}</style>

            <main className="min-h-screen bg-[#F7F7F8] p-3 sm:p-5 lg:p-7">
                <div className="max-w-full mx-auto space-y-4">

                    {/* ── HEADER ─────────────────────────────────────────── */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-gray-800 rounded-xl flex items-center justify-center shadow-md shadow-gray-800/20 shrink-0">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-lg font-black text-gray-900 tracking-tight leading-none">DP & Ambil Dulu</h1>
                                <p className="text-[11px] text-gray-400 mt-0.5">Transaksi belum lunas · Perlu tindakan</p>
                            </div>
                        </div>
                        <button
                            onClick={() => { fetchData(); if (activeTab === "history") fetchHistory(); }}
                            disabled={isLoading}
                            className="inline-flex items-center gap-1.5 h-8 px-3 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition shadow-sm"
                        >
                            <svg className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                        </button>
                    </div>

                    {/* ── STATS STRIP ─────────────────────────────────────── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {[
                            { label: "Total Pending", value: String(counts.all), sub: "transaksi aktif", color: "border-l-gray-700" },
                            { label: "DP", value: String(counts.reserved), sub: <span className="inline-flex items-center gap-1"><CreditCard size={11} /> Reserved</span>, color: "border-l-blue-400" },
                            { label: "Ambil Dulu", value: String(counts.held), sub: <span className="inline-flex items-center gap-1"><Package size={11} /> Held</span>, color: "border-l-orange-400" },
                            { label: "Total Nilai", value: fmt(totalValue), sub: "dari filter aktif", color: "border-l-emerald-500" },
                        ].map(s => (
                            <div key={s.label} className={`bg-white rounded-2xl border border-gray-100 border-l-4 ${s.color} shadow-sm px-4 py-3`}>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{s.label}</p>
                                <p className="text-xl font-black text-gray-800 mt-0.5 tabular-nums leading-tight">{s.value}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">{s.sub}</p>
                            </div>
                        ))}
                    </div>

                    {/* ── TAB + TOOLBAR ───────────────────────────────────── */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                        {/* Tab row */}
                        <div className="flex border-b border-gray-100">
                            {([
                                { key: "pending", label: <><Clock size={14} /> Belum Lunas</>, count: counts.all },
                                { key: "history", label: <><CheckCircle2 size={14} /> Sudah Lunas</>, count: historyTransactions.length },
                            ] as const).map(tab => (
                                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                    className={`flex-1 py-3 px-4 text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeTab === tab.key ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-50"}`}>
                                    {tab.label}
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${activeTab === tab.key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
                                        {tab.count}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Toolbar: search + filter pills */}
                        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-50">
                            {/* Search */}
                            <div className="relative flex-1 min-w-[180px]">
                                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input type="text"
                                    placeholder="Cari customer, invoice, laptop, no HP..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full h-8 border border-gray-200 rounded-xl pl-8 pr-7 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition font-medium placeholder:text-gray-400 placeholder:font-normal"
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery("")}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 transition">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                )}
                            </div>

                            {/* Filter pills — only for pending tab */}
                            {activeTab === "pending" && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {([
                                        { value: "ALL", label: "Semua", count: counts.all },
                                        { value: "RESERVED", label: <><CreditCard size={12} /> DP</>, count: counts.reserved },
                                        { value: "HELD", label: <><Package size={12} /> Ambil</>, count: counts.held },
                                        { value: "PENDING", label: <><Clock size={12} /> Pending</>, count: counts.pending },
                                    ] as const).map(opt => (
                                        <button key={opt.value} onClick={() => setFilterStatus(opt.value)}
                                            className={`h-7 px-2.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${filterStatus === opt.value ? "bg-gray-800 text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                                            {opt.label}
                                            <span className={`text-[10px] font-bold px-1 rounded-full ${filterStatus === opt.value ? "bg-white/20" : "bg-gray-200/80 text-gray-500"}`}>{opt.count}</span>
                                        </button>
                                    ))}
                                    <input type="number" placeholder="Sisa min (Rp)" value={minSisa} onChange={e => setMinSisa(e.target.value)}
                                        className="h-7 w-28 border border-gray-200 rounded-lg px-2 text-[11px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20" />
                                    <input type="number" placeholder="Sisa max (Rp)" value={maxSisa} onChange={e => setMaxSisa(e.target.value)}
                                        className="h-7 w-28 border border-gray-200 rounded-lg px-2 text-[11px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20" />
                                </div>
                            )}
                        </div>

                        {/* ── TABLE ─────────────────────────────────────────── */}
                        {activeTab === "pending" ? (
                            <div className="overflow-x-auto tbl-scroll">
                                <table className="w-full text-sm border-collapse">
                                    <TableHead />
                                    <tbody>
                                        {isLoading ? (
                                            <SkeletonRows count={8} />
                                        ) : filtered.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="py-16 text-center">
                                                    <div className="mb-3 flex justify-center">{transactions.length === 0 ? <PartyPopper size={40} className="text-gray-300" /> : <Search size={40} className="text-gray-300" />}</div>
                                                    <p className="text-sm font-semibold text-gray-600">
                                                        {transactions.length === 0 ? "Tidak ada transaksi pending" : "Tidak ada hasil"}
                                                    </p>
                                                    <p className="text-xs text-gray-400 mt-1">
                                                        {transactions.length === 0 ? "Semua transaksi sudah dilunasi" : "Coba ubah filter atau kata kunci"}
                                                    </p>
                                                </td>
                                            </tr>
                                        ) : (
                                            filtered.map((tx, idx) => (
                                                <PendingRow key={tx.id} tx={tx} idx={idx}
                                                    canConfirm={!!userId && tx.sales_id === userId}
                                                    canCancel={canCancel}
                                                    onConfirm={setConfirmPaymentTx}
                                                    onCancel={setCancelTx}
                                                    onDetail={setDetailTx}
                                                    onWhatsApp={handleWhatsApp} />
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="overflow-x-auto tbl-scroll">
                                <table className="w-full text-sm border-collapse">
                                    <TableHead isHistory />
                                    <tbody>
                                        {isLoadingHistory ? (
                                            <SkeletonRows count={8} />
                                        ) : historyTransactions.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="py-16 text-center">
                                                    <div className="mb-3 flex justify-center"><Inbox size={40} className="text-gray-300" /></div>
                                                    <p className="text-sm font-semibold text-gray-600">Belum ada riwayat pelunasan</p>
                                                    <p className="text-xs text-gray-400 mt-1">Transaksi DP & Ambil Dulu yang lunas akan muncul di sini</p>
                                                    <button onClick={fetchHistory}
                                                        className="mt-3 inline-flex items-center gap-1.5 h-8 px-4 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-200 transition">
                                                        <RefreshCw size={14} /> Muat Ulang
                                                    </button>
                                                </td>
                                            </tr>
                                        ) : (
                                            historyTransactions.map((tx, idx) => (
                                                <HistoryRow key={tx.id} tx={tx} idx={idx}
                                                    onDetail={setDetailTx}
                                                    onWhatsApp={handleWhatsApp} />
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Table footer */}
                        {!isLoading && !isLoadingHistory && (
                            <div className="px-4 py-2.5 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between gap-3">
                                <p className="text-[11px] text-gray-400">
                                    {activeTab === "pending" ? (
                                        <><span className="font-bold text-gray-600">{filtered.length}</span> dari <span className="font-bold text-gray-600">{transactions.length}</span> transaksi</>
                                    ) : (
                                        <><span className="font-bold text-gray-600">{historyTransactions.length}</span> transaksi lunas</>
                                    )}
                                </p>
                                {activeTab === "pending" && filtered.length > 0 && (
                                    <p className="text-[11px] text-gray-400">
                                        Total: <span className="font-bold text-gray-700">{fmt(totalValue)}</span>
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                </div>
            </main>

            {/* ── MODALS ───────────────────────────────────────────────── */}
            {alertModal && <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />}
            {confirmPaymentTx && (
                <ConfirmPaymentModal
                    tx={confirmPaymentTx}
                    onClose={() => setConfirmPaymentTx(null)}
                    onSuccess={() => {
                        const inv = confirmPaymentTx.invoice_number;
                        setAlertModal(`Transaksi ${inv} berhasil dilunasi!`);
                        fetchData();
                        fetchHistory();
                        setActiveTab("history");
                    }}
                />
            )}
            {detailTx && <DetailModal tx={detailTx} onClose={() => setDetailTx(null)} />}
            {cancelTx && (
                <CancelModal
                    tx={cancelTx}
                    cancelling={cancelling}
                    onConfirm={handleCancelConfirm}
                    onClose={() => setCancelTx(null)}
                />
            )}
        </DashboardLayout>
    );
}