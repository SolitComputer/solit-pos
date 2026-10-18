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
    marketing: "bg-pink-50 text-pink-700 ring-pink-200",
    sales: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    pengelola_barang: "bg-blue-50 text-blue-700 ring-blue-200",
    penyedia_barang: "bg-yellow-50 text-yellow-800 ring-yellow-200",
    hrd: "bg-cyan-50 text-cyan-700 ring-cyan-200",
    purchasing: "bg-violet-50 text-violet-700 ring-violet-200",
    accounting: "bg-amber-50 text-amber-700 ring-amber-200",
    programmer: "bg-indigo-50 text-indigo-700 ring-indigo-200",
};

// ── Warna spine (garis kiri kartu) & dot chip per divisi ────────────────────
const DIVISION_SPINE: Record<SopDivision, string> = {
    marketing: "bg-pink-500",
    sales: "bg-emerald-500",
    pengelola_barang: "bg-blue-500",
    penyedia_barang: "bg-yellow-400",
    hrd: "bg-cyan-500",
    purchasing: "bg-violet-500",
    accounting: "bg-amber-500",
    programmer: "bg-indigo-500",
};

// ── Warna badge per kategori (Fundamental vs Teknis Kerja) ──────────────────
const CATEGORY_COLORS: Record<SopCategory, string> = {
    fundamental: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    teknis: "bg-orange-50 text-orange-700 ring-orange-200",
};
const UNCATEGORIZED_LABEL = "Belum Dikategorikan";
const UNCATEGORIZED_COLOR = "bg-slate-100 text-slate-600 ring-slate-200";

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

function getInitial(name?: string | null): string {
    return (name?.trim()?.[0] ?? "?").toUpperCase();
}

const EMPTY_FORM = { sop_name: "", description: "", division: "" as string, category: "" as string };

// ── Class reuse ──────────────────────────────────────────────────────────────
const INPUT_CLASS =
    "w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 outline-none transition";

// ── Icons (inline SVG, reusable) ─────────────────────────────────────────────
function IconPlus({ className = "" }: { className?: string }) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}

function IconEdit() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5z" />
        </svg>
    );
}

function IconTrash({ size = 15 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" />
            <path d="M19 6l-.9 12.1a2 2 0 01-2 1.9H7.9a2 2 0 01-2-1.9L5 6" />
            <path d="M10 11v5M14 11v5" />
        </svg>
    );
}

function IconClose() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
        </svg>
    );
}

function IconChevronDown({ className = "" }: { className?: string }) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
        </svg>
    );
}

function IconClipboard({ className = "" }: { className?: string }) {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <path d="M9 12h6M9 16h6" />
        </svg>
    );
}

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

    // ── Display-only counters (tidak mengubah logic filter) ────────────────────
    const categoryCounts = useMemo(() => {
        const counts = {} as Record<SopCategory, number>;
        SOP_CATEGORIES.forEach((c) => {
            counts[c] = 0;
        });
        sops.forEach((s) => {
            if (s.category) counts[s.category] += 1;
        });
        return counts;
    }, [sops]);

    const divisionCounts = useMemo(() => {
        const counts: Partial<Record<SopDivision, number>> = {};
        categorySops.forEach((s) => {
            counts[s.division] = (counts[s.division] ?? 0) + 1;
        });
        return counts;
    }, [categorySops]);

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

    // ── Open create form (dipakai tombol header desktop & FAB mobile) ──────────
    const openCreateForm = () => {
        setFormOpen(true);
        setEditingId(null);
        setFormData({
            ...EMPTY_FORM,
            category: activeCategory === "uncategorized" ? "" : activeCategory,
        });
        setFormError("");
        window.scrollTo({ top: 0, behavior: "smooth" });
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

    // ── Render: Loading (skeleton di dalam layout, sidebar tidak "hilang") ────
    if (loading) {
        return (
            <DashboardLayout>
                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                    <div className="h-8 w-40 rounded-lg bg-slate-200 animate-pulse mb-2" />
                    <div className="h-4 w-64 rounded bg-slate-100 animate-pulse mb-6" />
                    <div className="h-12 w-full sm:w-96 rounded-2xl bg-slate-100 animate-pulse mb-5" />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-44 rounded-2xl bg-white border border-slate-200 p-5">
                                <div className="h-4 w-24 rounded bg-slate-100 animate-pulse mb-3" />
                                <div className="h-5 w-3/4 rounded bg-slate-200 animate-pulse mb-4" />
                                <div className="h-3 w-full rounded bg-slate-100 animate-pulse mb-2" />
                                <div className="h-3 w-5/6 rounded bg-slate-100 animate-pulse" />
                            </div>
                        ))}
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    const showDivisionFilter = userDivisions === "all" || availableDivisions.length > 1;

    return (
        <DashboardLayout>
            <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-28 sm:pb-10">
                {/* ── Header ─────────────────────────────────────────────────────── */}
                <header className="flex items-end justify-between gap-4 mb-6">
                    <div className="min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                            SOP Divisi
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">
                            {activeCategory === "uncategorized"
                                ? "SOP lama yang belum diberi kategori"
                                : `${SOP_CATEGORY_LABELS[activeCategory]} per divisi, total ${sops.length} SOP tersimpan`}
                        </p>
                    </div>

                    {/* Tombol desktop — di HP diganti FAB di pojok bawah */}
                    {canManage && !formOpen && (
                        <button
                            onClick={openCreateForm}
                            className="hidden sm:inline-flex flex-shrink-0 items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-md shadow-indigo-600/20 hover:bg-indigo-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30 transition"
                        >
                            <IconPlus />
                            Tambah SOP
                        </button>
                    )}
                </header>

                {/* ── Tab Kategori (segmented control) ───────────────────────────── */}
                <div className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
                    <div className="inline-flex p-1 rounded-2xl bg-slate-100 border border-slate-200/70">
                        {SOP_CATEGORIES.map((cat) => {
                            const active = activeCategory === cat;
                            return (
                                <button
                                    key={cat}
                                    onClick={() => setActiveCategory(cat)}
                                    aria-pressed={active}
                                    className={`flex-shrink-0 whitespace-nowrap inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${active
                                        ? "bg-white text-indigo-700 shadow-sm"
                                        : "text-slate-500 hover:text-slate-800"
                                        }`}
                                >
                                    {SOP_CATEGORY_LABELS[cat]}
                                    <span
                                        className={`min-w-[22px] text-center text-[11px] font-bold px-1.5 py-0.5 rounded-full ${active ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-500"
                                            }`}
                                    >
                                        {categoryCounts[cat]}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {canManage && uncategorizedCount > 0 && (
                        <button
                            onClick={() => setActiveCategory("uncategorized")}
                            aria-pressed={activeCategory === "uncategorized"}
                            className={`flex-shrink-0 whitespace-nowrap inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-sm font-bold transition border ${activeCategory === "uncategorized"
                                ? "bg-slate-800 text-white border-slate-800 shadow-sm"
                                : "bg-white text-slate-500 border-dashed border-slate-300 hover:bg-slate-50"
                                }`}
                        >
                            {UNCATEGORIZED_LABEL}
                            <span
                                className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${activeCategory === "uncategorized" ? "bg-white/20" : "bg-amber-100 text-amber-700"
                                    }`}
                            >
                                {uncategorizedCount}
                            </span>
                        </button>
                    )}
                </div>

                {/* ── Filter Divisi (admin: semua divisi, non-admin: divisinya) ─── */}
                {showDivisionFilter && (
                    <div className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
                        {userDivisions === "all" && (
                            <button
                                onClick={() => setFilter("all")}
                                aria-pressed={filter === "all"}
                                className={`flex-shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition border ${filter === "all"
                                    ? "bg-slate-900 text-white border-slate-900"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                                    }`}
                            >
                                Semua divisi
                                <span className={filter === "all" ? "text-white/60" : "text-slate-400"}>
                                    {categorySops.length}
                                </span>
                            </button>
                        )}
                        {availableDivisions.map((div) => {
                            const active = filter === div;
                            const count = divisionCounts[div] ?? 0;
                            return (
                                <button
                                    key={div}
                                    onClick={() => setFilter(div)}
                                    aria-pressed={active}
                                    className={`flex-shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition border ${active
                                        ? "bg-slate-900 text-white border-slate-900"
                                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                                        }`}
                                >
                                    <span className={`w-2 h-2 rounded-full ${DIVISION_SPINE[div]}`} />
                                    {SOP_DIVISION_LABELS[div]}
                                    {count > 0 && (
                                        <span className={active ? "text-white/60" : "text-slate-400"}>{count}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* ── Form Input SOP (Admin only) ────────────────────────────────── */}
                {canManage && formOpen && (
                    <section className="relative bg-white rounded-2xl border border-indigo-200 shadow-lg shadow-indigo-500/5 mb-6 overflow-hidden">
                        <div className="h-1 bg-indigo-600" />
                        <div className="p-4 sm:p-6">
                            <div className="flex items-start justify-between gap-3 mb-5">
                                <div>
                                    <h2 className="text-base sm:text-lg font-bold text-slate-900">
                                        {editingId ? "Edit SOP" : "Tambah SOP baru"}
                                    </h2>
                                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                                        Semua kolom wajib diisi sebelum disimpan.
                                    </p>
                                </div>
                                <button
                                    onClick={cancelForm}
                                    aria-label="Tutup form"
                                    className="p-2 -m-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                                >
                                    <IconClose />
                                </button>
                            </div>

                            <div className="space-y-4">
                                {/* Nama SOP */}
                                <div>
                                    <label htmlFor="sop-name" className="block text-sm font-semibold text-slate-700 mb-1.5">
                                        Nama SOP
                                    </label>
                                    <input
                                        id="sop-name"
                                        type="text"
                                        value={formData.sop_name}
                                        onChange={(e) =>
                                            setFormData((f) => ({ ...f, sop_name: e.target.value }))
                                        }
                                        placeholder="Contoh: SOP Penanganan Customer Baru"
                                        className={INPUT_CLASS}
                                    />
                                </div>

                                {/* Divisi + Kategori sejajar di layar ≥ sm */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* Divisi */}
                                    <div>
                                        <label htmlFor="sop-division" className="block text-sm font-semibold text-slate-700 mb-1.5">
                                            Divisi
                                        </label>
                                        <div className="relative">
                                            <select
                                                id="sop-division"
                                                value={formData.division}
                                                onChange={(e) =>
                                                    setFormData((f) => ({ ...f, division: e.target.value }))
                                                }
                                                className={`${INPUT_CLASS} appearance-none pr-10`}
                                            >
                                                <option value="">Pilih divisi</option>
                                                {SOP_DIVISIONS.map((div) => (
                                                    <option key={div} value={div}>
                                                        {SOP_DIVISION_LABELS[div]}
                                                    </option>
                                                ))}
                                            </select>
                                            <IconChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                        </div>
                                    </div>

                                    {/* Kategori */}
                                    <div>
                                        <label htmlFor="sop-category" className="block text-sm font-semibold text-slate-700 mb-1.5">
                                            Kategori
                                        </label>
                                        <div className="relative">
                                            <select
                                                id="sop-category"
                                                value={formData.category}
                                                onChange={(e) =>
                                                    setFormData((f) => ({ ...f, category: e.target.value }))
                                                }
                                                className={`${INPUT_CLASS} appearance-none pr-10`}
                                            >
                                                <option value="">Pilih kategori</option>
                                                {SOP_CATEGORIES.map((cat) => (
                                                    <option key={cat} value={cat}>
                                                        {SOP_CATEGORY_LABELS[cat]}
                                                    </option>
                                                ))}
                                            </select>
                                            <IconChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                        </div>
                                    </div>
                                </div>

                                {/* Penjelasan */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label htmlFor="sop-description" className="block text-sm font-semibold text-slate-700">
                                            Penjelasan SOP
                                        </label>
                                        <span className="text-[11px] text-slate-400 tabular-nums">
                                            {formData.description.length} karakter
                                        </span>
                                    </div>
                                    <textarea
                                        id="sop-description"
                                        value={formData.description}
                                        onChange={(e) =>
                                            setFormData((f) => ({ ...f, description: e.target.value }))
                                        }
                                        placeholder={"Tulis langkah-langkah SOP, contoh:\n1. Sapa customer dalam 5 menit\n2. Tanyakan kebutuhan & budget\n3. ..."}
                                        rows={7}
                                        className={`${INPUT_CLASS} resize-y min-h-[140px] leading-relaxed`}
                                    />
                                </div>

                                {/* Error */}
                                {formError && (
                                    <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5">
                                        <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                                        <p className="text-sm text-red-700 font-medium">{formError}</p>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex flex-col-reverse sm:flex-row sm:justify-end items-stretch sm:items-center gap-2.5 pt-2 border-t border-slate-100">
                                    <button
                                        onClick={cancelForm}
                                        className="mt-2.5 sm:mt-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.98] transition"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        onClick={handleSubmit}
                                        disabled={submitting}
                                        className="mt-2.5 sm:mt-3 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 shadow-md shadow-indigo-600/20 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30 transition"
                                    >
                                        {submitting && (
                                            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                        )}
                                        {submitting
                                            ? "Menyimpan..."
                                            : editingId
                                                ? "Simpan Perubahan"
                                                : "Simpan SOP"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* ── Info jumlah hasil ──────────────────────────────────────────── */}
                {filteredSops.length > 0 && (
                    <p className="text-xs text-slate-500 mb-3">
                        Menampilkan <span className="font-semibold text-slate-700">{filteredSops.length}</span> SOP
                        {filter !== "all" ? ` divisi ${SOP_DIVISION_LABELS[filter]}` : ""}
                    </p>
                )}

                {/* ── Daftar SOP ─────────────────────────────────────────────────── */}
                {filteredSops.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-slate-300 px-6 py-12 sm:py-16 text-center">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-500 mb-4">
                            <IconClipboard />
                        </div>
                        <p className="text-sm sm:text-base font-semibold text-slate-700">
                            Belum ada{" "}
                            {activeCategory === "uncategorized"
                                ? UNCATEGORIZED_LABEL
                                : SOP_CATEGORY_LABELS[activeCategory]}
                            {filter !== "all"
                                ? ` untuk divisi ${SOP_DIVISION_LABELS[filter]}`
                                : ""}
                        </p>
                        <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xs mx-auto">
                            {canManage
                                ? 'Klik "Tambah SOP" untuk membuat SOP baru.'
                                : "SOP akan muncul setelah Admin menambahkannya."}
                        </p>
                        {canManage && !formOpen && (
                            <button
                                onClick={openCreateForm}
                                className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition"
                            >
                                <IconPlus />
                                Tambah SOP
                            </button>
                        )}
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

            {/* ── FAB Tambah SOP (khusus HP) ─────────────────────────────────────── */}
            {canManage && !formOpen && (
                <button
                    onClick={openCreateForm}
                    aria-label="Tambah SOP"
                    className="sm:hidden fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 inline-flex items-center gap-2 pl-4 pr-5 h-12 rounded-full bg-indigo-600 text-white text-sm font-bold shadow-xl shadow-indigo-600/30 active:scale-95 transition"
                >
                    <IconPlus />
                    Tambah SOP
                </button>
            )}

            {/* ── Modal Konfirmasi Hapus (bottom sheet di HP, dialog di laptop) ─── */}
            {deleteTarget && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-sm"
                    onClick={() => {
                        if (!deleting) setDeleteTarget(null);
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delete-sop-title"
                        className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="sm:hidden mx-auto w-10 h-1.5 rounded-full bg-slate-200 mb-5" />
                        <div className="flex items-start gap-3.5 mb-5">
                            <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                                <IconTrash size={18} />
                            </div>
                            <div className="min-w-0">
                                <h3 id="delete-sop-title" className="text-base font-bold text-slate-900">
                                    Hapus SOP?
                                </h3>
                                <p className="text-sm text-slate-600 mt-1 break-words">
                                    SOP{" "}
                                    <span className="font-semibold text-slate-900">
                                        &ldquo;{deleteTarget.sop_name}&rdquo;
                                    </span>{" "}
                                    akan dihapus permanen. Aksi ini tidak bisa dibatalkan.
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 sm:justify-end">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleting}
                                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 sm:bg-transparent hover:bg-slate-100 transition"
                            >
                                Batal
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={deleting}
                                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 transition"
                            >
                                {deleting && (
                                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                )}
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
        <article className="relative bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition overflow-hidden">
            {/* Spine warna divisi — ciri khas "binder SOP" */}
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${DIVISION_SPINE[sop.division]}`} aria-hidden="true" />

            <div className="pl-5 pr-4 sm:pl-6 sm:pr-5 py-4 sm:py-5">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                        {/* Division + Category badge */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                            <span
                                className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md ring-1 ring-inset ${DIVISION_COLORS[sop.division]}`}
                            >
                                {SOP_DIVISION_LABELS[sop.division]}
                            </span>
                            <span
                                className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md ring-1 ring-inset ${sop.category ? CATEGORY_COLORS[sop.category] : UNCATEGORIZED_COLOR}`}
                            >
                                {sop.category ? SOP_CATEGORY_LABELS[sop.category] : UNCATEGORIZED_LABEL}
                            </span>
                        </div>

                        {/* SOP name */}
                        <h3 className="text-[15px] sm:text-base font-bold text-slate-900 leading-snug break-words">
                            {sop.sop_name}
                        </h3>
                    </div>

                    {/* Admin actions — selalu terlihat (aman untuk layar sentuh) */}
                    {canManage && (
                        <div className="flex items-center gap-0.5 flex-shrink-0 -mr-1.5 -mt-1">
                            <button
                                onClick={onEdit}
                                title="Edit SOP"
                                aria-label={`Edit SOP ${sop.sop_name}`}
                                className="p-2.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 transition"
                            >
                                <IconEdit />
                            </button>
                            <button
                                onClick={onDelete}
                                title="Hapus SOP"
                                aria-label={`Hapus SOP ${sop.sop_name}`}
                                className="p-2.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 transition"
                            >
                                <IconTrash />
                            </button>
                        </div>
                    )}
                </div>

                {/* Description */}
                <div className="relative">
                    <p
                        className={`text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words ${!expanded && isLong ? "line-clamp-4" : ""}`}
                    >
                        {sop.description}
                    </p>
                    {isLong && (
                        <button
                            onClick={() => setExpanded(!expanded)}
                            aria-expanded={expanded}
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition"
                        >
                            {expanded ? "Tutup" : "Selengkapnya"}
                            <IconChevronDown className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
                        </button>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center gap-2.5 mt-4 pt-3 border-t border-slate-100">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center">
                        {getInitial(sop.creator?.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-700 truncate">
                            {sop.creator?.name ?? "—"}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                            {formatDate(sop.created_at)}
                            {sop.updated_at !== sop.created_at && (
                                <span className="italic">, diperbarui {formatDate(sop.updated_at)}</span>
                            )}
                        </p>
                    </div>
                </div>
            </div>
        </article>
    );
}