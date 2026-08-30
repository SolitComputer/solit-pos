"use client";
// src/app/dashboard/data-barang/CategoriesContent.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuthUser } from "@/hooks/useAuthUser";
import { BARANG_FULL_ACCESS_ROLES, hasAnyRole } from "@/lib/permissions";

interface Category {
    id: string;
    name: string;
    description: string | null;
    type?: string | null; // 'LAPTOP' | 'AKSESORIS' — bisa null kalau migrasi belum jalan
    created_by: string | null;
    created_at: string;
}

// Badge tipe kategori. Kategori tanpa type (migrasi belum jalan) tidak dikasih badge.
function TypeBadge({ type }: { type?: string | null }) {
    if (type !== "LAPTOP" && type !== "AKSESORIS") return null;
    const isLaptop = type === "LAPTOP";
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${isLaptop ? "bg-indigo-50 text-indigo-700" : "bg-violet-50 text-violet-700"}`}>
            {isLaptop ? "Laptop" : "Aksesoris"}
        </span>
    );
}

const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });

export default function CategoriesContent() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchText, setSearchText] = useState("");

    const [modalOpen, setModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const { user } = useAuthUser();
    const userRoles: string[] = user?.roles?.length ? user.roles : user?.role ? [user.role] : [];
    const canManage = hasAnyRole(userRoles, BARANG_FULL_ACCESS_ROLES);

    const loadCategories = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch("/api/categories");
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Gagal memuat data kategori");
            setCategories(json.data as Category[]);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Terjadi kesalahan");
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { loadCategories(); }, [loadCategories]);

    const filtered = useMemo(() => {
        const q = searchText.trim().toLowerCase();
        if (!q) return categories;
        return categories.filter(c =>
            c.name.toLowerCase().includes(q) ||
            (c.description ?? "").toLowerCase().includes(q)
        );
    }, [categories, searchText]);

    const openCreate = () => { setEditingCategory(null); setModalOpen(true); };
    const openEdit = (cat: Category) => { setEditingCategory(cat); setModalOpen(true); };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Gagal menghapus kategori");
            setCategories(prev => prev.filter(c => c.id !== id));
            toast.success("Kategori berhasil dihapus");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal menghapus kategori");
        } finally {
            setDeletingId(null);
            setConfirmDeleteId(null);
        }
    };

    return (
        <div>
            {/* ── Sub-header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-xl flex items-center justify-center shadow-md shadow-indigo-900/25 flex-shrink-0">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white"
                            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="7" height="7" rx="1.5" />
                            <rect x="14" y="3" width="7" height="7" rx="1.5" />
                            <rect x="3" y="14" width="7" height="7" rx="1.5" />
                            <rect x="14" y="14" width="7" height="7" rx="1.5" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 leading-tight">Kategori Barang</h2>
                        <p className="text-[12px] text-gray-400">Kelola kategori untuk mengelompokkan laptop dan aksesoris</p>
                    </div>
                </div>
                {canManage && (
                    <button
                        onClick={openCreate}
                        className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-indigo-600/20 transition active:scale-[0.98]"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Tambah Kategori
                    </button>
                )}
            </div>

            {/* ── Search bar ── */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 shadow-sm">
                <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        placeholder="Cari nama kategori..."
                        className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                </div>
                <p className="mt-2.5 text-[12px] text-gray-400">{filtered.length} dari {categories.length} kategori</p>
            </div>

            {/* ── Konten ── */}
            {loading ? (
                <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
                    ))}
                </div>
            ) : error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
                    <p className="text-sm text-red-600 font-medium mb-3">{error}</p>
                    <button onClick={loadCategories} className="text-sm font-semibold text-red-700 underline underline-offset-2">
                        Coba lagi
                    </button>
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-10 text-center">
                    <p className="text-sm text-gray-500 font-medium">
                        {categories.length === 0 ? "Belum ada kategori. Tambahkan kategori pertama." : "Tidak ada kategori yang cocok dengan pencarian."}
                    </p>
                </div>
            ) : (
                <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                                    <th className="text-left font-semibold px-4 py-3">No</th>
                                    <th className="text-left font-semibold px-4 py-3">Nama Kategori</th>
                                    <th className="text-left font-semibold px-4 py-3">Tipe</th>
                                    <th className="text-left font-semibold px-4 py-3">Deskripsi</th>
                                    <th className="text-left font-semibold px-4 py-3">Dibuat</th>
                                    {canManage && <th className="text-right font-semibold px-4 py-3">Aksi</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filtered.map((cat, i) => (
                                    <tr key={cat.id} className="hover:bg-gray-50/60 transition">
                                        <td className="px-4 py-3 text-gray-400 tabular-nums">{String(i + 1).padStart(2, "0")}</td>
                                        <td className="px-4 py-3 font-medium text-gray-800">{cat.name}</td>
                                        <td className="px-4 py-3"><TypeBadge type={cat.type} /></td>
                                        <td className="px-4 py-3 text-gray-600 max-w-[280px] truncate" title={cat.description ?? ""}>
                                            {cat.description || <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                                            {formatDate(cat.created_at)}
                                            {cat.created_by && <span className="text-gray-300"> · {cat.created_by}</span>}
                                        </td>
                                        {canManage && (
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => openEdit(cat)}
                                                        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                                        title="Edit kategori"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmDeleteId(cat.id)}
                                                        disabled={deletingId === cat.id}
                                                        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                                                        title="Hapus kategori"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {modalOpen && (
                <CategoryFormModal
                    category={editingCategory}
                    onClose={() => setModalOpen(false)}
                    onSuccess={() => { setModalOpen(false); loadCategories(); }}
                />
            )}

            {confirmDeleteId && (
                <div
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                    onClick={() => setConfirmDeleteId(null)}
                >
                    <div
                        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="text-base font-bold text-gray-900 mb-1.5">Hapus Kategori?</h3>
                        <p className="text-[13px] text-gray-500 mb-5">
                            Kategori yang sudah dihapus tidak bisa dikembalikan. Kategori yang masih dipakai laptop tidak bisa dihapus.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
                            >
                                Batal
                            </button>
                            <button
                                onClick={() => handleDelete(confirmDeleteId)}
                                disabled={deletingId === confirmDeleteId}
                                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition disabled:opacity-60 active:scale-[0.98]"
                            >
                                {deletingId === confirmDeleteId ? "Menghapus…" : "Ya, Hapus"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Modal Form (Create / Edit) ──────────────────────────────────────────────
function CategoryFormModal({
    category, onClose, onSuccess,
}: {
    category: Category | null;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const isEdit = !!category;
    const [name, setName] = useState(category?.name ?? "");
    const [description, setDescription] = useState(category?.description ?? "");
    // Default AKSESORIS untuk kategori baru (mayoritas kategori adalah aksesoris).
    const [type, setType] = useState<"LAPTOP" | "AKSESORIS">(
        category?.type === "LAPTOP" ? "LAPTOP" : "AKSESORIS",
    );
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!name.trim()) return toast.error("Nama kategori wajib diisi");

        setSubmitting(true);
        try {
            const url = isEdit ? `/api/categories/${category!.id}` : "/api/categories";
            const method = isEdit ? "PUT" : "POST";
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), description: description.trim() || null, type }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Gagal menyimpan kategori");
            toast.success(isEdit ? "Kategori berhasil diperbarui" : "Kategori berhasil ditambahkan");
            onSuccess();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Terjadi kesalahan");
        } finally { setSubmitting(false); }
    };

    return (
        <div
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
            onClick={onClose}
        >
            <div
                className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                    <h3 className="text-base font-bold text-gray-900">{isEdit ? "Edit Kategori" : "Tambah Kategori"}</h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Nama Kategori</label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Contoh: Gaming, Ultrabook, Workstation…"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Tipe Kategori</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(["LAPTOP", "AKSESORIS"] as const).map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setType(t)}
                                    className={`py-2.5 rounded-xl border text-sm font-semibold transition ${type === t
                                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                        : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                                >
                                    {t === "LAPTOP" ? "Laptop" : "Aksesoris"}
                                </button>
                            ))}
                        </div>
                        <p className="mt-1.5 text-[11px] text-gray-400">Menentukan kategori ini muncul di dropdown Laptop atau Aksesoris.</p>
                    </div>
                    <div>
                        <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Deskripsi (Opsional)</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={3}
                            placeholder="Keterangan singkat tentang kategori ini…"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                    </div>
                </div>

                <div className="flex gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
                    <button onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                        Batal
                    </button>
                    <button onClick={handleSubmit} disabled={submitting}
                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-sm font-semibold transition disabled:opacity-60 active:scale-[0.98]">
                        {submitting ? "Menyimpan…" : "Simpan"}
                    </button>
                </div>
            </div>
        </div>
    );
}