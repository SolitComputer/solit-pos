"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    SOP_DIVISIONS,
    SOP_DIVISION_LABELS,
    SOP_CATEGORIES,
    SOP_CATEGORY_LABELS,
    type SopDivision,
    type SopCategory,
} from "@/lib/sop";
import DashboardLayout from "@/components/layout/DashboardLayout";

// ── Types ────────────────────────────────────────────────────────────────────
interface SopEntry {
    id: string;
    sop_name: string;
    description: string;
    division: SopDivision;
    category: SopCategory | null;
    created_by: string;
    created_at: string;
    updated_at: string;
    creator?: { name: string } | null;
}

interface ApiResponse {
    success: boolean;
    data: SopEntry[];
    canManage: boolean;
    userDivisions: SopDivision[] | "all";
    message?: string;
}

// ── Warna badge per divisi ───────────────────────────────────────────────────
const DIVISION_COLORS: Record<SopDivision, string> = {
    marketing: "bg-pink-100 text-pink-700",
    sales: "bg-emerald-100 text-emerald-700",
    pengelola_barang: "bg-blue-100 text-blue-700",
    penyedia_barang: "bg-yellow-100 text-yellow-700",
    hrd: "bg-cyan-100 text-cyan-700",
    purchasing: "bg-violet-100 text-violet-700",
    accounting: "bg-amber-100 text-amber-700",
    programmer: "bg-indigo-100 text-indigo-700",
};

// ── Warna badge per kategori (Fundamental vs Teknis Kerja) ──────────────────
const CATEGORY_COLORS: Record<SopCategory, string> = {
    fundamental: "bg-indigo-100 text-indigo-700",
    teknis: "bg-orange-100 text-orange-700",
};
const UNCATEGORIZED_LABEL = "Belum Dikategorikan";
const UNCATEGORIZED_COLOR = "bg-slate-200 text-slate-600";

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

const EMPTY_FORM = { sop_name: "", description: "", division: "" as string, category: "" as string };

// ═════════════════════════════════════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════════════════════════════════════
export default function SopDivisiClient() {
    // ── State ──────────────────────────────────────────────────────────────────
    const [sops, setSops] = useState<SopEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [canManage, setCanManage] = useState(false);
    const [userDivisions, setUserDivisions] = useState<SopDivision[] | "all">(
        []
    );

    // Tab kategori: SOP Fundamental vs SOP Teknis Kerja (+ "uncategorized" khusus
    // Admin untuk nyari data lama yang belum di-assign kategori).
    const [activeCategory, setActiveCategory] = useState<SopCategory | "uncategorized">("fundamental");

    // Filter (admin pakai dropdown divisi, non-admin otomatis)
    const [filter, setFilter] = useState<"all" | SopDivision>("all");

    // Form
    const [formOpen, setFormOpen] = useState(false);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");

    // Delete confirmation
    const [deleteTarget, setDeleteTarget] = useState<SopEntry | null>(null);
    const [deleting, setDeleting] = useState(false);

    // ── Fetch SOP ──────────────────────────────────────────────────────────────
    const fetchSops = useCallback(async () => {
        try {
            const res = await fetch("/api/sop");
            const json: ApiResponse = await res.json();
            if (json.success) {
                setSops(json.data);
                setCanManage(json.canManage);
                setUserDivisions(json.userDivisions);
            }
        } catch (err) {
            console.error("Fetch SOP error:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSops();
    }, [fetchSops]);

    // ── Filtered data ──────────────────────────────────────────────────────────
    // Step 1: filter berdasarkan tab kategori aktif.
    const categorySops = useMemo(() => {
        if (activeCategory === "uncategorized") return sops.filter((s) => !s.category);
        return sops.filter((s) => s.category === activeCategory);
    }, [sops, activeCategory]);

    // Step 2: dari hasil kategori, filter lagi berdasarkan divisi (chip filter).
    const filteredSops = useMemo(() => {
        if (filter === "all") return categorySops;
        return categorySops.filter((s) => s.division === filter);
    }, [categorySops, filter]);

    // Jumlah SOP lama yang belum dikategorikan — buat badge tab khusus Admin.
    const uncategorizedCount = useMemo(
        () => sops.filter((s) => !s.category).length,
        [sops]
    );

    // Divisi yang tersedia untuk filter tabs (admin = semua, non-admin = miliknya)
    const availableDivisions = useMemo(() => {
        if (userDivisions === "all") return [...SOP_DIVISIONS];
        return userDivisions;
    }, [userDivisions]);

    // ── Submit (create / update) ───────────────────────────────────────────────
    const handleSubmit = async () => {
        setFormError("");

        if (!formData.sop_name.trim()) {
            setFormError("Nama SOP wajib diisi");
            return;
        }
        if (!formData.division) {
            setFormError("Divisi wajib dipilih");
            return;
        }
        if (!formData.category) {
            setFormError("Kategori (Fundamental / Teknis Kerja) wajib dipilih");
            return;
        }
        if (!formData.description.trim()) {
            setFormError("Penjelasan SOP wajib diisi");
            return;
        }

        setSubmitting(true);
        try {
            const isEdit = !!editingId;
            const url = isEdit ? `/api/sop/${editingId}` : "/api/sop";
            const method = isEdit ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });
            const json = await res.json();

            if (!json.success) {
                setFormError(json.message || "Gagal menyimpan SOP");
                return;
            }

            // Reset form & refresh list
            setFormData(EMPTY_FORM);
            setEditingId(null);
            setFormOpen(false);
            await fetchSops();
        } catch {
            setFormError("Terjadi kesalahan jaringan");
        } finally {
            setSubmitting(false);
        }
    };

    // ── Edit ───────────────────────────────────────────────────────────────────
    const startEdit = (sop: SopEntry) => {
        setFormData({
            sop_name: sop.sop_name,
            description: sop.description,
            division: sop.division,
            category: sop.category ?? "",
        });
        setEditingId(sop.id);
        setFormOpen(true);
        setFormError("");
        // Scroll ke atas supaya form terlihat
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const cancelForm = () => {
        setFormData(EMPTY_FORM);
        setEditingId(null);
        setFormOpen(false);
        setFormError("");
    };

    // ── Delete ─────────────────────────────────────────────────────────────────
    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/sop/${deleteTarget.id}`, {
                method: "DELETE",
            });
            const json = await res.json();
            if (json.success) {
                setDeleteTarget(null);
                await fetchSops();
            }
        } catch {
            // silent
        } finally {
            setDeleting(false);
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center py-32">
                <div className="animate-spin w-8 h-8 border-[3px] border-indigo-600 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <DashboardLayout>
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                {/* ── Header ─────────────────────────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                            SOP
                        </h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            {activeCategory === "uncategorized"
                                ? "SOP lama yang belum diberi kategori"
                                : `${SOP_CATEGORY_LABELS[activeCategory]} — per divisi`}
                        </p>
                    </div>

                    {canManage && !formOpen && (
                        <button
                            onClick={() => {
                                setFormOpen(true);
                                setEditingId(null);
                                setFormData({
                                    ...EMPTY_FORM,
                                    category: activeCategory === "uncategorized" ? "" : activeCategory,
                                });
                                setFormError("");
                            }}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-sm font-bold shadow-md shadow-indigo-500/20 hover:brightness-110 active:scale-[0.98] transition w-full sm:w-auto"
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                            Tambah SOP
                        </button>
                    )}
                </div>

                {/* ── Tab Kategori: SOP Fundamental vs SOP Teknis Kerja ──────────── */}
                <div className="flex items-center gap-1.5 mb-3 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
                    {SOP_CATEGORIES.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`flex-shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl text-sm font-bold transition ${activeCategory === cat
                                    ? "bg-indigo-600 text-white shadow-sm"
                                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                                }`}
                        >
                            {SOP_CATEGORY_LABELS[cat]}
                        </button>
                    ))}
                    {canManage && uncategorizedCount > 0 && (
                        <button
                            onClick={() => setActiveCategory("uncategorized")}
                            className={`flex-shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5 ${activeCategory === "uncategorized"
                                    ? "bg-slate-800 text-white shadow-sm"
                                    : "bg-white text-slate-500 hover:bg-slate-100 border border-dashed border-slate-300"
                                }`}
                        >
                            {UNCATEGORIZED_LABEL}
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${activeCategory === "uncategorized" ? "bg-white/20" : "bg-slate-200"}`}>
                                {uncategorizedCount}
                            </span>
                        </button>
                    )}
                </div>

                {/* ── Filter Tabs (admin: semua divisi, non-admin: divisinya) ───── */}
                {(userDivisions === "all" || availableDivisions.length > 1) && (
                    <div className="flex items-center gap-1.5 mb-5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
                        {userDivisions === "all" && (
                            <button
                                onClick={() => setFilter("all")}
                                className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition ${filter === "all"
                                        ? "bg-indigo-600 text-white shadow-sm"
                                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                                    }`}
                            >
                                Semua
                            </button>
                        )}
                        {availableDivisions.map((div) => (
                            <button
                                key={div}
                                onClick={() => setFilter(div)}
                                className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition ${filter === div
                                        ? "bg-indigo-600 text-white shadow-sm"
                                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                                    }`}
                            >
                                {SOP_DIVISION_LABELS[div]}
                            </button>
                        ))}
                    </div>
                )}

                {/* ── Form Input SOP (Admin only) ────────────────────────────────── */}
                {canManage && formOpen && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 mb-6 shadow-sm">
                        <h2 className="text-base font-bold text-slate-800 mb-4">
                            {editingId ? "Edit SOP" : "Tambah SOP Baru"}
                        </h2>

                        <div className="space-y-4">
                            {/* Nama SOP */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                    Nama SOP
                                </label>
                                <input
                                    type="text"
                                    value={formData.sop_name}
                                    onChange={(e) =>
                                        setFormData((f) => ({ ...f, sop_name: e.target.value }))
                                    }
                                    placeholder="Contoh: SOP Penanganan Customer Baru"
                                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 outline-none transition"
                                />
                            </div>

                            {/* Divisi + Kategori sejajar di layar ≥ sm */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Divisi */}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                        Divisi
                                    </label>
                                    <select
                                        value={formData.division}
                                        onChange={(e) =>
                                            setFormData((f) => ({ ...f, division: e.target.value }))
                                        }
                                        className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 outline-none transition appearance-none"
                                    >
                                        <option value="">— Pilih Divisi —</option>
                                        {SOP_DIVISIONS.map((div) => (
                                            <option key={div} value={div}>
                                                {SOP_DIVISION_LABELS[div]}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Kategori */}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                        Kategori
                                    </label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) =>
                                            setFormData((f) => ({ ...f, category: e.target.value }))
                                        }
                                        className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 outline-none transition appearance-none"
                                    >
                                        <option value="">— Pilih Kategori —</option>
                                        {SOP_CATEGORIES.map((cat) => (
                                            <option key={cat} value={cat}>
                                                {SOP_CATEGORY_LABELS[cat]}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Penjelasan */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                    Penjelasan SOP
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) =>
                                        setFormData((f) => ({ ...f, description: e.target.value }))
                                    }
                                    placeholder="Jelaskan langkah-langkah SOP secara detail..."
                                    rows={5}
                                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 outline-none transition resize-y min-h-[100px]"
                                />
                            </div>

                            {/* Error */}
                            {formError && (
                                <p className="text-sm text-red-600 font-medium">{formError}</p>
                            )}

                            {/* Actions */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                                <button
                                    onClick={handleSubmit}
                                    disabled={submitting}
                                    className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 shadow-md shadow-indigo-500/20 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition w-full sm:w-auto justify-center"
                                >
                                    {submitting
                                        ? "Menyimpan..."
                                        : editingId
                                            ? "Simpan Perubahan"
                                            : "Simpan SOP"}
                                </button>
                                <button
                                    onClick={cancelForm}
                                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.98] transition w-full sm:w-auto justify-center"
                                >
                                    Batal
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Daftar SOP ─────────────────────────────────────────────────── */}
                {filteredSops.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-slate-100 mb-4">
                            <svg
                                width="22"
                                height="22"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                className="text-slate-400"
                            >
                                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                                <rect x="9" y="3" width="6" height="4" rx="1" />
                                <path d="M9 12h6M9 16h6" />
                            </svg>
                        </div>
                        <p className="text-sm font-semibold text-slate-600">
                            Belum ada{" "}
                            {activeCategory === "uncategorized"
                                ? UNCATEGORIZED_LABEL
                                : SOP_CATEGORY_LABELS[activeCategory]}
                            {filter !== "all"
                                ? ` untuk divisi ${SOP_DIVISION_LABELS[filter]}`
                                : ""}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                            {canManage
                                ? 'Klik "Tambah SOP" untuk membuat SOP baru.'
                                : "SOP akan muncul setelah Admin menambahkannya."}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4 items-start">
                        {filteredSops.map((sop) => (
                            <SopCard
                                key={sop.id}
                                sop={sop}
                                canManage={canManage}
                                onEdit={() => startEdit(sop)}
                                onDelete={() => setDeleteTarget(sop)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* ── Modal Konfirmasi Hapus ──────────────────────────────────────── */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div
                        className="bg-white rounded-2xl w-full max-w-sm p-5 sm:p-6 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-base font-bold text-slate-900 mb-2">
                            Hapus SOP?
                        </h3>
                        <p className="text-sm text-slate-600 mb-1">
                            SOP{" "}
                            <span className="font-semibold">
                                &ldquo;{deleteTarget.sop_name}&rdquo;
                            </span>{" "}
                            akan dihapus permanen.
                        </p>
                        <p className="text-xs text-slate-400 mb-5">
                            Aksi ini tidak bisa dibatalkan.
                        </p>
                        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 sm:justify-end">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleting}
                                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition w-full sm:w-auto justify-center"
                            >
                                Batal
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={deleting}
                                className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 transition w-full sm:w-auto justify-center"
                            >
                                {deleting ? "Menghapus..." : "Ya, Hapus"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-component: SOP Card
// ═════════════════════════════════════════════════════════════════════════════
function SopCard({
    sop,
    canManage,
    onEdit,
    onDelete,
}: {
    sop: SopEntry;
    canManage: boolean;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const isLong = sop.description.length > 200;

    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow">
            {/* Header row */}
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                    {/* Division + Category badge */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        <span
                            className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${DIVISION_COLORS[sop.division]
                                }`}
                        >
                            {SOP_DIVISION_LABELS[sop.division]}
                        </span>
                        <span
                            className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${sop.category ? CATEGORY_COLORS[sop.category] : UNCATEGORIZED_COLOR
                                }`}
                        >
                            {sop.category ? SOP_CATEGORY_LABELS[sop.category] : UNCATEGORIZED_LABEL}
                        </span>
                    </div>

                    {/* SOP name */}
                    <h3 className="text-base font-bold text-slate-900 leading-snug break-words">
                        {sop.sop_name}
                    </h3>
                </div>

                {/* Admin actions */}
                {canManage && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                            onClick={onEdit}
                            title="Edit SOP"
                            className="p-2.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5z" />
                            </svg>
                        </button>
                        <button
                            onClick={onDelete}
                            title="Hapus SOP"
                            className="p-2.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" />
                                <path d="M19 6l-.9 12.1a2 2 0 01-2 1.9H7.9a2 2 0 01-2-1.9L5 6" />
                                <path d="M10 11v5M14 11v5" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>

            {/* Description */}
            <div className="relative">
                <p
                    className={`text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words ${!expanded && isLong ? "line-clamp-3" : ""
                        }`}
                >
                    {sop.description}
                </p>
                {isLong && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="mt-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition"
                    >
                        {expanded ? "Tutup" : "Selengkapnya..."}
                    </button>
                )}
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-4 pt-3 border-t border-slate-100">
                <span className="text-[11px] text-slate-400">
                    Dibuat oleh{" "}
                    <span className="font-semibold text-slate-500">
                        {sop.creator?.name ?? "—"}
                    </span>
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-[11px] text-slate-400">
                    {formatDate(sop.created_at)}
                </span>
                {sop.updated_at !== sop.created_at && (
                    <>
                        <span className="text-slate-300">•</span>
                        <span className="text-[11px] text-slate-400 italic">
                            diperbarui {formatDate(sop.updated_at)}
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}