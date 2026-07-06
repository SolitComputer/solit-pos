"use client";

import { useState } from "react";

export interface LaptopUnit {
    id: string;
    laptop_id: string;
    serial_number: string;
    grade: "A" | "B" | "C";
    condition_note: string;
    purchase_price: number;
    selling_price: number;
    status: string;
    notes: string;
    received_at?: string;
    created_at: string;
}

const GRADE_STYLE: Record<string, { label: string; desc: string }> = {
    A: { label: "Grade A", desc: "Sempurna" },
    B: { label: "Grade B", desc: "Minus" },
    C: { label: "Grade C", desc: "Banyak minus" },
};

// Style map untuk grade button di form (pakai class statis agar Tailwind tidak purge)
const GRADE_FORM_STYLE: Record<string, { border: string; text: string; sub: string }> = {
    A: { border: "border-emerald-400 bg-emerald-50", text: "text-emerald-700", sub: "text-emerald-500" },
    B: { border: "border-amber-400 bg-amber-50", text: "text-amber-700", sub: "text-amber-500" },
    C: { border: "border-red-400 bg-red-50", text: "text-red-700", sub: "text-red-500" },
};

const EMPTY_FORM = {
    serial_number: "",
    grade: "A",
    condition_note: "",
    purchase_price: "",
    selling_price: "",
    status: "SIAP_JUAL",
    notes: "",
    received_at: "",
};

function fmtDate(iso: string) {
    if (!iso) return "—";
    return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

function buildInitialFormData(editingUnit: LaptopUnit | null, defaultSellingPrice: number): Record<string, string> {
    if (!editingUnit) {
        return { ...EMPTY_FORM, selling_price: String(defaultSellingPrice || "") };
    }
    // Preserve status asli — hanya normalisasi saat form ditampilkan untuk pilihan user
    // SOLD dan SERVICE tetap disimpan, bukan di-override ke BELUM_SIAP
    const editableStatus =
        editingUnit.status === "SIAP_JUAL" ? "SIAP_JUAL" :
            editingUnit.status === "SOLD" ? "SOLD" :
                editingUnit.status === "SERVICE" ? "SERVICE" :
                    "BELUM_SIAP";
    return {
        serial_number: editingUnit.serial_number,
        grade: editingUnit.grade,
        condition_note: editingUnit.condition_note || "",
        purchase_price: String(editingUnit.purchase_price || ""),
        selling_price: String(editingUnit.selling_price || ""),
        status: editableStatus,
        notes: editingUnit.notes || "",
        received_at: editingUnit.created_at ? new Date(editingUnit.created_at).toISOString().split("T")[0] : "",
    };
}

export default function UnitFormModal({
    laptopId,
    defaultSellingPrice,
    editingUnit,
    onClose,
    onSuccess,
    onError,
}: {
    laptopId: string;
    defaultSellingPrice: number;
    editingUnit: LaptopUnit | null;
    onClose: () => void;
    onSuccess: () => void;
    onError: (message: string) => void;
}) {
    const [formData, setFormData] = useState<Record<string, string>>(() =>
        buildInitialFormData(editingUnit, defaultSellingPrice)
    );
    const [formLoading, setFormLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormLoading(true);
        try {
            const payload = {
                ...formData,
                purchase_price: Number(formData.purchase_price),
                selling_price: Number(formData.selling_price),
                ...(formData.received_at
                    ? { received_at: new Date(formData.received_at).toISOString() }
                    : { received_at: undefined }),
            };
            const url = editingUnit ? `/api/units/${editingUnit.id}` : `/api/laptops/${laptopId}/units`;
            const method = editingUnit ? "PUT" : "POST";
            const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const result = await res.json();
            if (!result.success) { onError(result.message); return; }
            onSuccess();
            onClose();
        } catch {
            onError("Terjadi kesalahan");
        } finally {
            setFormLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full max-w-md rounded-xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                    <div>
                        <h3 className="font-semibold text-gray-800 text-sm">{editingUnit ? "Edit Unit" : "Tambah Unit Baru"}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">{editingUnit ? "Perbarui informasi unit" : "Isi data unit laptop"}</p>
                    </div>
                    <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4">
                    <form onSubmit={handleSubmit} className="space-y-4">

                        {/* Serial Number */}
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                Serial Number <span className="text-red-400">*</span>
                            </label>
                            <div className="flex gap-2">
                                <input name="serial_number" placeholder="Contoh: SN-2024-001"
                                    value={formData.serial_number} onChange={handleChange} required
                                    className="flex-1 h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                                <button type="button"
                                    onClick={() => {
                                        if (!formData.serial_number) { alert("Masukkan serial number dulu"); return; }
                                        window.open(`https://www.google.com/search?q=${encodeURIComponent(formData.serial_number + " laptop")}`, "_blank");
                                    }}
                                    className="px-3 h-9 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition whitespace-nowrap">
                                    🔍 Cek
                                </button>
                            </div>
                        </div>

                        {/* Harga Jual */}
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                Harga Jual <span className="text-red-400">*</span>
                            </label>
                            <input name="selling_price" type="number" placeholder="0"
                                value={formData.selling_price} onChange={handleChange} required
                                className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                            {editingUnit && (
                                <p className="text-[10px] text-violet-600 mt-1 flex items-center gap-1">
                                    <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Harga modal diedit langsung dari tabel (kolom Harga Modal)
                                </p>
                            )}
                        </div>

                        {/* Status — 2 tombol besar */}
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-2">
                                Status <span className="text-red-400">*</span>
                            </label>

                            {/* Read-only badge untuk SOLD dan SERVICE */}
                            {(formData.status === "SOLD" || formData.status === "SERVICE") ? (
                                <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 ${formData.status === "SOLD"
                                    ? "border-gray-300 bg-gray-50"
                                    : "border-blue-300 bg-blue-50"
                                    }`}>
                                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${formData.status === "SOLD" ? "bg-gray-400" : "bg-blue-500"
                                        }`} />
                                    <div>
                                        <p className={`text-sm font-bold ${formData.status === "SOLD" ? "text-gray-600" : "text-blue-700"
                                            }`}>
                                            {formData.status === "SOLD" ? "Terjual" : "Service"}
                                        </p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">
                                            Status ini tidak dapat diubah melalui form edit.
                                            Ganti harga modal di atas lalu klik Simpan.
                                        </p>
                                    </div>
                                    {/* Hidden input untuk tetap mengirim status asli */}
                                    <input type="hidden" name="status" value={formData.status} />
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, status: "SIAP_JUAL" }))}
                                        className={`relative py-3 px-3 rounded-xl border-2 transition-all text-left ${formData.status === "SIAP_JUAL"
                                            ? "border-emerald-500 bg-emerald-50 shadow-sm"
                                            : "border-gray-200 bg-white hover:border-gray-300"
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${formData.status === "SIAP_JUAL" ? "bg-emerald-500" : "bg-gray-300"
                                                }`} />
                                            <p className={`text-sm font-bold ${formData.status === "SIAP_JUAL" ? "text-emerald-700" : "text-gray-600"
                                                }`}>Siap Jual</p>
                                        </div>
                                        <p className={`text-[10px] leading-tight ml-4 ${formData.status === "SIAP_JUAL" ? "text-emerald-500" : "text-gray-400"
                                            }`}>
                                            Pilih Grade di bawah
                                        </p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, status: "BELUM_SIAP" }))}
                                        className={`relative py-3 px-3 rounded-xl border-2 transition-all text-left ${formData.status === "BELUM_SIAP"
                                            ? "border-amber-500 bg-amber-50 shadow-sm"
                                            : "border-gray-200 bg-white hover:border-gray-300"
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${formData.status === "BELUM_SIAP" ? "bg-amber-500" : "bg-gray-300"
                                                }`} />
                                            <p className={`text-sm font-bold ${formData.status === "BELUM_SIAP" ? "text-amber-700" : "text-gray-600"
                                                }`}>Belum Siap</p>
                                        </div>
                                        <p className={`text-[10px] leading-tight ml-4 ${formData.status === "BELUM_SIAP" ? "text-amber-500" : "text-gray-400"
                                            }`}>
                                            Beri keterangan di bawah
                                        </p>
                                    </button>
                                </div>
                            )}
                        </div>


                        {formData.status === "SIAP_JUAL" ? (
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                    Grade <span className="text-red-400">*</span>
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(["A", "B", "C"] as const).map(g => {
                                        const gs = GRADE_STYLE[g];
                                        const selected = formData.grade === g;
                                        const st = GRADE_FORM_STYLE[g];
                                        return (
                                            <button
                                                key={g}
                                                type="button"
                                                onClick={() => setFormData(prev => ({ ...prev, grade: g }))}
                                                className={`py-2.5 px-2 rounded-xl border-2 transition-all text-center ${selected ? `${st.border} shadow-sm` : "border-gray-200 bg-white hover:border-gray-300"
                                                    }`}
                                            >
                                                <p className={`text-sm font-black ${selected ? st.text : "text-gray-700"}`}>{gs.label}</p>
                                                <p className={`text-[10px] mt-0.5 ${selected ? st.sub : "text-gray-400"}`}>{gs.desc}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : formData.status === "BELUM_SIAP" ? (
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                    Keterangan Belum Siap
                                    <span className="text-gray-400 font-normal ml-1">(opsional)</span>
                                </label>
                                <textarea
                                    name="condition_note"
                                    placeholder="Contoh: perlu ganti baterai, layar retak, belum dicek teknisi..."
                                    value={formData.condition_note}
                                    onChange={handleChange}
                                    rows={3}
                                    className="w-full border border-amber-200 rounded-xl px-3 py-2.5 text-sm bg-amber-50/40 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 focus:bg-white transition resize-none placeholder:text-gray-400"
                                />
                                <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                                    <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Unit tidak akan muncul di daftar siap jual
                                </p>
                            </div>
                        ) : null /* SOLD / SERVICE — tidak ada selector grade/kondisi tambahan */}

                        {/* Kondisi tambahan (hanya tampil kalau Siap Jual) */}
                        {formData.status === "SIAP_JUAL" && (
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                    Catatan Kondisi
                                    <span className="text-gray-400 font-normal ml-1">(opsional)</span>
                                </label>
                                <input
                                    name="condition_note"
                                    placeholder="Kondisi fisik unit, misal: mulus, ada goresan tipis..."
                                    value={formData.condition_note}
                                    onChange={handleChange}
                                    className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                                />
                            </div>
                        )}

                        {/* Tanggal Masuk */}
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                Tanggal Masuk
                                <span className="text-gray-300 ml-1 font-normal">(opsional, default hari ini)</span>
                            </label>
                            <input name="received_at" type="date" value={formData.received_at} onChange={handleChange}
                                max={new Date().toISOString().split("T")[0]}
                                className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                            {formData.received_at && (
                                <p className="text-[10px] text-gray-400 mt-1">Barang masuk: {fmtDate(formData.received_at)}</p>
                            )}
                        </div>

                        {/* Notes Internal */}
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes Internal</label>
                            <textarea name="notes" placeholder="Catatan tambahan..." value={formData.notes} onChange={handleChange} rows={2}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition resize-none" />
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button type="button" onClick={onClose}
                                className="flex-1 h-9 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
                                Batal
                            </button>
                            <button type="submit" disabled={formLoading}
                                className="flex-1 h-9 bg-[#1a1a2e] text-white rounded-lg text-sm font-medium hover:bg-[#16213e] transition disabled:opacity-50">
                                {formLoading ? (
                                    <span className="flex items-center justify-center gap-1.5">
                                        <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Loading
                                    </span>
                                ) : (editingUnit ? "Simpan" : "Tambah")}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
