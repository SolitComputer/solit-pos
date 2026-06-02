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

// ─── Modal Reserve (DP) ───────────────────────────────────────────────────────
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
        company_name: "",
        amount: String(unit.selling_price || ""),
        payment_method: "TRANSFER",
        source_platform: "",
        notes: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm(p => ({ ...p, [e.target.name]: e.target.value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.customer_name.trim()) { setError("Nama pelanggan wajib diisi"); return; }
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
                    amount: Number(form.amount) || 0,
                    payment_method: form.payment_method,
                    source_platform: form.source_platform || null,
                    notes: form.notes || null,
                    sales_name: salesName,
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
    const accent = isDP ? "violet" : "orange";

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
                {/* Header */}
                <div className={`px-5 py-4 border-b ${isDP ? "border-violet-100 bg-violet-50/50" : "border-orange-100 bg-orange-50/50"}`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-bold text-gray-800 text-base">
                                {isDP ? "🔒 Pesanan DP" : "📦 Ambil Dulu"}
                            </h2>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {isDP ? "Unit akan dikunci, belum diserahkan" : "Barang diambil, pembayaran menyusul"}
                            </p>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Unit Info */}
                <div className="px-5 pt-4 pb-0">
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-start gap-3">
                        <div className="text-2xl">💻</div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-800 truncate">
                                {unit.laptop?.laptop_name || "—"}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                SN: <code className="font-mono bg-gray-100 px-1 rounded">{unit.serial_number}</code>
                                {" · "}{unit.grade} · {fmt(unit.selling_price)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                Nama Pelanggan / Reseller <span className="text-red-400">*</span>
                            </label>
                            <input
                                name="customer_name"
                                value={form.customer_name}
                                onChange={handleChange}
                                placeholder="Nama lengkap..."
                                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">No. HP</label>
                            <input
                                name="customer_phone"
                                value={form.customer_phone}
                                onChange={handleChange}
                                placeholder="08xxx..."
                                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">Perusahaan</label>
                            <input
                                name="company_name"
                                value={form.company_name}
                                onChange={handleChange}
                                placeholder="Opsional..."
                                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                {isDP ? "Jumlah DP" : "Harga Deal"}
                            </label>
                            <input
                                name="amount"
                                type="number"
                                value={form.amount}
                                onChange={handleChange}
                                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"
                            />
                        </div>
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
                        <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">Sumber</label>
                            <input
                                name="source_platform"
                                value={form.source_platform}
                                onChange={handleChange}
                                placeholder="WhatsApp, Facebook, Instagram..."
                                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">Catatan</label>
                            <textarea
                                name="notes"
                                value={form.notes}
                                onChange={handleChange}
                                rows={2}
                                placeholder="Keterangan tambahan..."
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition resize-none"
                            />
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
                                ? "Unit akan berstatus DIPESAN. SN tidak akan muncul di transaksi sampai pelunasan dikonfirmasi."
                                : "Unit berstatus DIAMBIL. Konfirmasi pelunasan di halaman Riwayat Transaksi."}
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

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className={`flex-1 h-10 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50 ${isDP
                                ? "bg-violet-600 hover:bg-violet-700"
                                : "bg-orange-500 hover:bg-orange-600"
                                }`}
                        >
                            {loading ? "Menyimpan..." : isDP ? "Kunci Unit (DP)" : "Konfirmasi Ambil"}
                        </button>
                    </div>
                </form>
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
    const [serialNumber, setSerialNumber] = useState(
        unit.status === "HELD" ? unit.serial_number : ""
    );
    const [paymentProof, setPaymentProof] = useState<string | null>(null);
    const [uploadingProof, setUploadingProof] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ← TAMBAH: state untuk daftar SN rekomendasi
    const [suggestedSNs, setSuggestedSNs] = useState<{ serial_number: string; grade: string; selling_price: number }[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // ← TAMBAH: fetch SN yang tersedia saat modal dibuka
    useEffect(() => {
        const fetchSuggestedSNs = async () => {
            if (!unit.laptop_id) return;
            try {
                const res = await fetch(`/api/laptops/${unit.laptop_id}/units`);
                const result = await res.json();
                if (result.data) {
                    // Untuk RESERVED: tampilkan unit SIAP_JUAL (unit yang belum dipesan)
                    // Untuk HELD: tampilkan unit HELD saja (unit yang sudah diambil ini)
                    const filtered = (result.data as any[]).filter(u =>
                        unit.status === "RESERVED"
                            ? u.status === "SIAP_JUAL"
                            : u.status === "HELD"
                    );
                    setSuggestedSNs(filtered.map(u => ({
                        serial_number: u.serial_number,
                        grade: u.grade,
                        selling_price: Math.round(Number(u.selling_price) || 0),
                    })));
                }
            } catch { /* ignore */ }
        };
        fetchSuggestedSNs();
    }, [unit.laptop_id, unit.status]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    // ← TAMBAH: filter suggestions berdasarkan input
    const filteredSuggestions = suggestedSNs.filter(s =>
        s.serial_number.toLowerCase().includes(serialNumber.toLowerCase())
    );

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
        } catch { /* non-blocking */ } finally {
            setUploadingProof(false);
        }
    };

    const handleConfirm = async () => {
        if (!unit.reserved_invoice) { setError("Invoice tidak ditemukan"); return; }
        if (unit.status === "RESERVED" && !serialNumber.trim()) {
            setError("Serial number wajib diisi untuk transaksi DP");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/units/confirm-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    invoice_number: unit.reserved_invoice,
                    serial_number: serialNumber.trim() || unit.serial_number,
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

    const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-50 to-green-50 px-5 py-4 border-b border-emerald-100">
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
                </div>

                <div className="p-5 space-y-4">
                    {/* Info transaksi */}
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                        <p className="text-xs text-gray-400 mb-1">Unit</p>
                        <p className="text-sm font-bold text-gray-800">{unit.laptop?.laptop_name || "—"}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Invoice: <span className="font-mono font-medium">{unit.reserved_invoice || "—"}</span>
                        </p>
                        <p className="text-xs text-gray-500">
                            Dipesan oleh: <span className="font-medium">{unit.reserved_by || "—"}</span>
                        </p>
                    </div>

                    {/* Input SN untuk RESERVED — dengan autocomplete */}
                    {unit.status === "RESERVED" && (
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                Serial Number Unit <span className="text-red-400">*</span>
                            </label>
                            <p className="text-[10px] text-gray-400 mb-1.5">
                                Transaksi DP belum ada SN. Masukkan SN unit yang akan diserahkan.
                            </p>

                            {/* Input + dropdown wrapper */}
                            <div className="relative">
                                <input
                                    type="text"
                                    value={serialNumber}
                                    onChange={e => {
                                        setSerialNumber(e.target.value);
                                        setShowSuggestions(true);
                                        setError("");
                                    }}
                                    onFocus={() => setShowSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                                    placeholder="Ketik atau pilih SN..."
                                    className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition"
                                    autoFocus
                                />

                                {/* Dropdown rekomendasi */}
                                {showSuggestions && filteredSuggestions.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden max-h-44 overflow-y-auto">
                                        <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50">
                                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                                                Unit Siap Jual ({filteredSuggestions.length})
                                            </p>
                                        </div>
                                        {filteredSuggestions.map(s => (
                                            <button
                                                key={s.serial_number}
                                                type="button"
                                                onMouseDown={() => {
                                                    setSerialNumber(s.serial_number);
                                                    setShowSuggestions(false);
                                                }}
                                                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-emerald-50 transition text-left border-b border-gray-50 last:border-0"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs text-gray-800 font-medium">
                                                        {s.serial_number}
                                                    </span>
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${s.grade === "A" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                                        s.grade === "B" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                                            "bg-red-50 text-red-700 border-red-200"
                                                        }`}>
                                                        {s.grade}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-gray-500 tabular-nums">
                                                    {fmt(s.selling_price)}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Empty state jika tidak ada SN tersedia */}
                                {showSuggestions && suggestedSNs.length === 0 && serialNumber === "" && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 px-3 py-2.5">
                                        <p className="text-xs text-gray-400 text-center">Tidak ada unit siap jual untuk laptop ini</p>
                                    </div>
                                )}
                            </div>

                            {/* Indikator SN sudah dipilih */}
                            {serialNumber && suggestedSNs.find(s => s.serial_number === serialNumber) && (
                                <div className="flex items-center gap-1.5 mt-1.5">
                                    <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <p className="text-[10px] text-emerald-600 font-medium">SN ditemukan di stok</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Info HELD — tampilkan SN yang sudah tercatat */}
                    {unit.status === "HELD" && (
                        <div className="bg-orange-50 border border-orange-100 rounded-xl px-3 py-2.5">
                            <p className="text-xs text-orange-700">
                                Unit sudah diambil oleh pelanggan. Konfirmasi ini akan menandai transaksi sebagai LUNAS.
                            </p>
                            {unit.serial_number && (
                                <div className="flex items-center gap-2 mt-2">
                                    <p className="text-[10px] text-orange-500 font-medium">SN Unit:</p>
                                    <code className="text-xs font-mono bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                                        {unit.serial_number}
                                    </code>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Upload bukti bayar */}
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">
                            Bukti Transfer
                            <span className="text-gray-400 font-normal ml-1">(opsional)</span>
                        </label>
                        {paymentProof ? (
                            <div className="relative flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                                <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                                    <img src={paymentProof} alt="Bukti bayar" className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-emerald-700">✓ Foto terupload</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">Bukti transfer tersimpan</p>
                                </div>
                                <button
                                    onClick={() => { setPaymentProof(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                                    className="w-7 h-7 bg-red-50 text-red-500 border border-red-200 rounded-lg flex items-center justify-center hover:bg-red-100 transition flex-shrink-0"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingProof}
                                className="w-full h-16 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center gap-2 text-gray-400 hover:border-gray-300 hover:bg-gray-50 transition"
                            >
                                {uploadingProof ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                                        <span className="text-xs">Mengupload...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        <span className="text-xs">Upload foto bukti</span>
                                    </>
                                )}
                            </button>
                        )}
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleProofUpload} className="hidden" />
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                            <p className="text-xs text-red-700">{error}</p>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
                        >
                            Batal
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={loading || uploadingProof}
                            className="flex-1 h-10 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
                        >
                            {loading ? "Memproses..." : "Konfirmasi Lunas"}
                        </button>
                    </div>
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
        list.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
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