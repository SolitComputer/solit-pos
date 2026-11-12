"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { X, Plus, Edit2, Archive, RotateCcw, Save, AlertCircle, Info, Loader2 } from "lucide-react";
import type { CustomCashflowCategory } from "@/lib/cashflow";
import {
    CASHFLOW_CATEGORIES,
    MANUAL_INCOME_ONLY_CATEGORIES,
    MANUAL_EXPENSE_ONLY_CATEGORIES,
    KASBON_CICILAN_CATEGORIES,
} from "@/lib/cashflow";

// ⬅️ UPDATE: tidak pakai ACCOUNTS hardcoded lagi. Akun diambil dari DB
// via /api/akutansi/accounts supaya:
// 1. Akun custom (yang dibikin user di Kelola Akun) ikut muncul di sini
// 2. Akun yang diarsipkan (is_active=false) otomatis tidak muncul
// 3. Sinkron dengan dropdown akun di Jurnal Umum
type AccountFromAPI = {
    code: string;
    name: string;
    type: string;
    is_active?: boolean;
    source?: "bawaan" | "custom";
};

interface CategoryManagerModalProps {
    open: boolean;
    onClose: () => void;
    onChanged: () => void; // dipanggil setelah create/update/delete sukses
}

type Direction = "IN" | "OUT" | "BOTH";

interface FormState {
    label: string;
    account_code: string;
    direction: Direction;
}

const INITIAL_FORM: FormState = {
    label: "",
    account_code: "",
    direction: "OUT",
};

// ⬅️ UPDATE: tipe akun pakai bahasa Indonesia sesuai field `type` di DB akun
// Solit POS (lihat halaman Kelola Akun di modul Akuntansi). Normalisasi case
// di-handle di `normalizeAccountType()` di bawah supaya matching tetap jalan
// walau DB kirim "Aset" / "aset" / "ASET".
const ACCOUNT_GROUPS: Array<{ label: string; type: string }> = [
    { label: "Aset", type: "ASET" },
    { label: "Hutang / Kewajiban", type: "HUTANG" },
    { label: "Modal / Ekuitas", type: "MODAL" },
    { label: "Pemasukan / Pendapatan", type: "PEMASUKAN" },
    { label: "Beban / Pengeluaran", type: "BEBAN" },
];

// ⬅️ Normalisasi tipe akun: uppercase + strip spasi, supaya "Aset" di DB
// cocok dengan "ASET" di ACCOUNT_GROUPS. Biar fleksibel kalau ada variasi casing.
const normalizeAccountType = (t: string) => (t ?? "").trim().toUpperCase();

export default function CategoryManagerModal({
    open,
    onClose,
    onChanged,
}: CategoryManagerModalProps) {
    const [categories, setCategories] = useState<CustomCashflowCategory[]>([]);
    const [accounts, setAccounts] = useState<AccountFromAPI[]>([]); // ⬅️ BARU: akun dari DB
    const [loading, setLoading] = useState(false);
    const [loadingAccounts, setLoadingAccounts] = useState(false); // ⬅️ BARU: loading state akun
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // form state — bisa buat tambah baru (editingId=null) atau edit (editingId=xxx)
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(INITIAL_FORM);
    const [showArchived, setShowArchived] = useState(false);

    // ── Fetch list ─────────────────────────────────────────────────────────
    const fetchList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/cashflow-categories");
            const json = await res.json();
            if (!res.ok || !json.success)
                throw new Error(json.message ?? "Gagal memuat kategori");
            setCategories(json.data ?? []);
        } catch (e: any) {
            setError(e.message ?? "Gagal memuat kategori");
        } finally {
            setLoading(false);
        }
    }, []);

    // ⬅️ BARU — Fetch akun dari DB (bukan dari ACCOUNTS hardcoded). Sumber
    // kebenaran satu-satunya: /api/akutansi/accounts — sama dengan sumber
    // yang dipakai halaman Kelola Akun & dropdown akun di Jurnal Umum.
    // Akun yang diarsipkan (is_active=false) otomatis di-filter di sini,
    // supaya user tidak bisa map kategori custom ke akun yang sudah diarsip.
    const fetchAccounts = useCallback(async () => {
        setLoadingAccounts(true);
        try {
            const res = await fetch("/api/akutansi/accounts", { cache: "no-store" });
            const json = await res.json();
            if (!res.ok || !json.success)
                throw new Error(json.message ?? "Gagal memuat daftar akun");
            // Filter akun aktif aja. Kalau response gak punya field is_active (akun
            // bawaan lama), anggap aktif.
            const activeAccounts = (json.data ?? []).filter(
                (a: AccountFromAPI) => a.is_active !== false
            );
            setAccounts(activeAccounts);
        } catch (e: any) {
            setError(e.message ?? "Gagal memuat daftar akun akuntansi");
        } finally {
            setLoadingAccounts(false);
        }
    }, []);

    useEffect(() => {
        if (open) {
            fetchList();
            fetchAccounts(); // ⬅️ BARU: ambil juga daftar akun dari DB
            // Reset form tiap kali modal dibuka
            setEditingId(null);
            setForm(INITIAL_FORM);
            setError(null);
            setSuccessMsg(null);
        }
    }, [open, fetchList, fetchAccounts]);

    // ── Flash success message 3 detik ──────────────────────────────────────
    useEffect(() => {
        if (!successMsg) return;
        const t = setTimeout(() => setSuccessMsg(null), 3000);
        return () => clearTimeout(t);
    }, [successMsg]);

    // ── Filter list ────────────────────────────────────────────────────────
    const visibleCategories = useMemo(
        () =>
            showArchived
                ? categories
                : categories.filter((c) => c.is_active),
        [categories, showArchived]
    );

    // ── Account options (grouped) ──────────────────────────────────────────
    // ⬅️ UPDATE: sumber data `accounts` (dari DB), bukan `ACCOUNTS` hardcoded.
    // Grouping pakai normalizeAccountType() supaya toleran terhadap variasi
    // casing di DB ("Aset" / "ASET" / "aset" semua cocok ke group ASET).
    // dependency: accounts → kalau akun baru dibikin di Kelola Akun & user
    // balik ke modal ini, dropdown auto-update.
    const accountOptions = useMemo(() => {
        return ACCOUNT_GROUPS.map((group) => ({
            label: group.label,
            options: accounts
                .filter((a) => normalizeAccountType(a.type) === group.type)
                .sort((a, b) => a.code.localeCompare(b.code)) // urut by kode akun ascending
                .map((a) => ({
                    value: a.code,
                    label: `${a.code} — ${a.name}`,
                })),
        })).filter((g) => g.options.length > 0);
    }, [accounts]);

    // ⬅️ UPDATE: cari label akun dari state `accounts`, bukan dari ACCOUNTS hardcoded.
    // Fallback ke code aja kalau akun tidak ditemukan (misal akun di-delete tapi
    // masih dipakai kategori lama).
    const accountLabel = useCallback((code: string): string => {
        const acc = accounts.find((a) => a.code === code);
        return acc ? `${acc.code} — ${acc.name}` : code;
    }, [accounts]);

    // ── Submit (create or update) ──────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);

        if (!form.label.trim()) {
            setError("Nama kategori wajib diisi");
            return;
        }
        if (!form.account_code) {
            setError("Pilih akun akuntansi");
            return;
        }

        setSaving(true);
        try {
            const url = editingId
                ? `/api/cashflow-categories/${editingId}`
                : "/api/cashflow-categories";
            const method = editingId ? "PUT" : "POST";
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    label: form.label.trim(),
                    account_code: form.account_code,
                    direction: form.direction,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success)
                throw new Error(json.message ?? "Gagal menyimpan");

            setSuccessMsg(
                editingId
                    ? `Kategori "${form.label}" berhasil diperbarui`
                    : json.reactivated
                        ? `Kategori "${form.label}" berhasil diaktifkan kembali`
                        : `Kategori "${form.label}" berhasil ditambahkan`
            );
            setForm(INITIAL_FORM);
            setEditingId(null);
            await fetchList();
            onChanged();
        } catch (e: any) {
            setError(e.message ?? "Gagal menyimpan");
        } finally {
            setSaving(false);
        }
    };

    // ── Edit ───────────────────────────────────────────────────────────────
    const handleEdit = (cat: CustomCashflowCategory) => {
        setEditingId(cat.id);
        setForm({
            label: cat.label,
            account_code: cat.account_code,
            direction: cat.direction,
        });
        setError(null);
        setSuccessMsg(null);
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setForm(INITIAL_FORM);
        setError(null);
    };

    // ── Archive (soft delete) ──────────────────────────────────────────────
    const handleArchive = async (cat: CustomCashflowCategory) => {
        if (
            !confirm(
                `Arsipkan kategori "${cat.label}"?\n\nEntry cashflow lama yang pakai kategori ini tetap kebaca, cuma gak muncul lagi di dropdown.`
            )
        )
            return;

        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/cashflow-categories/${cat.id}`, {
                method: "DELETE",
            });
            const json = await res.json();
            if (!res.ok || !json.success)
                throw new Error(json.message ?? "Gagal mengarsipkan");

            setSuccessMsg(`Kategori "${cat.label}" berhasil diarsipkan`);
            await fetchList();
            onChanged();
        } catch (e: any) {
            setError(e.message ?? "Gagal mengarsipkan");
        } finally {
            setSaving(false);
        }
    };

    // ── Reactivate ─────────────────────────────────────────────────────────
    const handleReactivate = async (cat: CustomCashflowCategory) => {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/cashflow-categories/${cat.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "reactivate" }),
            });
            const json = await res.json();
            if (!res.ok || !json.success)
                throw new Error(json.message ?? "Gagal mengaktifkan");

            setSuccessMsg(`Kategori "${cat.label}" berhasil diaktifkan kembali`);
            await fetchList();
            onChanged();
        } catch (e: any) {
            setError(e.message ?? "Gagal mengaktifkan");
        } finally {
            setSaving(false);
        }
    };

    // ── Hardcoded categories (read-only info section) ──────────────────────
    const hardcodedCategories = useMemo(() => {
        const items: Array<{ key: string; label: string; group: string }> = [];
        Object.entries(CASHFLOW_CATEGORIES).forEach(([key, label]) =>
            items.push({ key, label, group: "Umum (Masuk & Keluar)" })
        );
        Object.entries(MANUAL_INCOME_ONLY_CATEGORIES).forEach(([key, label]) =>
            items.push({ key, label, group: "Khusus Uang Masuk" })
        );
        Object.entries(MANUAL_EXPENSE_ONLY_CATEGORIES).forEach(([key, label]) =>
            items.push({ key, label, group: "Khusus Uang Keluar" })
        );
        Object.entries(KASBON_CICILAN_CATEGORIES).forEach(([key, label]) =>
            items.push({ key, label, group: "Kasbon & Cicilan (Khusus)" })
        );
        return items;
    }, []);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => {
                if (e.target === e.currentTarget && !saving) onClose();
            }}
        >
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* ── Header ─────────────────────────────────────────── */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Kelola Kategori Cashflow
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Tambah kategori custom & petakan ke akun akuntansi
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 disabled:opacity-50"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* ── Body ───────────────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Flash messages */}
                    {error && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-800 dark:text-red-200">
                            <AlertCircle size={16} className="shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}
                    {successMsg && (
                        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-sm text-green-800 dark:text-green-200">
                            ✓ {successMsg}
                        </div>
                    )}

                    {/* ── Form Tambah / Edit ─────────────────────────────── */}
                    <section className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                            {editingId ? (
                                <>
                                    <Edit2 size={14} /> Edit Kategori
                                </>
                            ) : (
                                <>
                                    <Plus size={14} /> Tambah Kategori Baru
                                </>
                            )}
                        </h3>

                        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3">
                            {/* Label */}
                            <div className="md:col-span-5">
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Nama Kategori <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={form.label}
                                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                                    placeholder="Mis. Biaya Sewa Ruko"
                                    maxLength={100}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                    disabled={saving}
                                />
                                {!editingId && form.label && (
                                    <p className="text-[10px] text-gray-500 mt-1">
                                        Key: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                                            {form.label
                                                .trim()
                                                .toUpperCase()
                                                .replace(/[^A-Z0-9\s_]/g, "")
                                                .replace(/\s+/g, "_")
                                                .replace(/_+/g, "_")
                                                .replace(/^_|_$/g, "") || "—"}
                                        </code>
                                    </p>
                                )}
                            </div>

                            {/* Account */}
                            <div className="md:col-span-5">
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Akun Akuntansi <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={form.account_code}
                                    onChange={(e) => setForm({ ...form, account_code: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                                    required
                                    disabled={saving || loadingAccounts}
                                >
                                    {/* ⬅️ UPDATE: placeholder dinamis — kasih info status ke user */}
                                    <option value="">
                                        {loadingAccounts
                                            ? "⏳ Memuat akun..."
                                            : accounts.length === 0
                                                ? "⚠ Tidak ada akun ditemukan"
                                                : "— Pilih Akun —"}
                                    </option>
                                    {accountOptions.map((grp) => (
                                        <optgroup key={grp.label} label={grp.label}>
                                            {grp.options.map((opt) => (
                                                <option key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                                {/* ⬅️ BARU: info jumlah akun yang bisa dipilih — biar user tau kalau dropdown-nya hidup */}
                                {!loadingAccounts && accounts.length > 0 && (
                                    <p className="text-[10px] text-gray-400 mt-1">
                                        {accounts.length} akun aktif tersedia (dari Kelola Akun di modul Akuntansi)
                                    </p>
                                )}
                            </div>

                            {/* Direction */}
                            <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Arah <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={form.direction}
                                    onChange={(e) =>
                                        setForm({ ...form, direction: e.target.value as Direction })
                                    }
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    disabled={saving}
                                >
                                    <option value="OUT">Keluar</option>
                                    <option value="IN">Masuk</option>
                                    <option value="BOTH">Keduanya</option>
                                </select>
                            </div>

                            {/* Actions */}
                            <div className="md:col-span-12 flex items-center justify-end gap-2 pt-2">
                                {editingId && (
                                    <button
                                        type="button"
                                        onClick={handleCancelEdit}
                                        disabled={saving}
                                        className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
                                    >
                                        Batal
                                    </button>
                                )}
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    {saving ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : editingId ? (
                                        <Save size={14} />
                                    ) : (
                                        <Plus size={14} />
                                    )}
                                    {saving ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Tambah"}
                                </button>
                            </div>
                        </form>
                    </section>

                    {/* ── Tabel Kategori Custom ─────────────────────────── */}
                    <section>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                                Kategori Custom ({visibleCategories.length})
                            </h3>
                            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={showArchived}
                                    onChange={(e) => setShowArchived(e.target.checked)}
                                    className="rounded"
                                />
                                Tampilkan yang diarsipkan
                            </label>
                        </div>

                        {loading ? (
                            <div className="text-center py-8 text-sm text-gray-500">
                                <Loader2 size={20} className="animate-spin inline mr-2" />
                                Memuat...
                            </div>
                        ) : visibleCategories.length === 0 ? (
                            <div className="text-center py-8 text-sm text-gray-500 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
                                Belum ada kategori custom. Tambahkan lewat form di atas.
                            </div>
                        ) : (
                            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 dark:bg-gray-800">
                                        <tr className="text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                            <th className="px-3 py-2">Nama</th>
                                            <th className="px-3 py-2">Akun</th>
                                            <th className="px-3 py-2">Arah</th>
                                            <th className="px-3 py-2">Status</th>
                                            <th className="px-3 py-2 text-right">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {visibleCategories.map((cat) => (
                                            <tr
                                                key={cat.id}
                                                className={`${cat.is_active
                                                    ? "bg-white dark:bg-gray-900"
                                                    : "bg-gray-50 dark:bg-gray-800/50 opacity-70"
                                                    } hover:bg-gray-50 dark:hover:bg-gray-800`}
                                            >
                                                <td className="px-3 py-2">
                                                    <div className="font-medium text-gray-900 dark:text-white">
                                                        {cat.label}
                                                    </div>
                                                    <code className="text-[10px] text-gray-500">{cat.key}</code>
                                                </td>
                                                <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                                                    {accountLabel(cat.account_code)}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span
                                                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cat.direction === "IN"
                                                            ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                                                            : cat.direction === "OUT"
                                                                ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                                                                : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                                                            }`}
                                                    >
                                                        {cat.direction === "IN"
                                                            ? "Masuk"
                                                            : cat.direction === "OUT"
                                                                ? "Keluar"
                                                                : "Keduanya"}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">
                                                    {cat.is_active ? (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                                                            Aktif
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                                                            Diarsipkan
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {cat.is_active ? (
                                                            <>
                                                                <button
                                                                    onClick={() => handleEdit(cat)}
                                                                    disabled={saving}
                                                                    className="p-1.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 disabled:opacity-50"
                                                                    title="Edit"
                                                                >
                                                                    <Edit2 size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleArchive(cat)}
                                                                    disabled={saving}
                                                                    className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 disabled:opacity-50"
                                                                    title="Arsipkan"
                                                                >
                                                                    <Archive size={14} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleReactivate(cat)}
                                                                disabled={saving}
                                                                className="p-1.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 disabled:opacity-50"
                                                                title="Aktifkan Kembali"
                                                            >
                                                                <RotateCcw size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    {/* ── Info Kategori Bawaan (read-only) ───────────────── */}
                    <section className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50/50 dark:bg-blue-950/20">
                        <div className="flex items-start gap-2 mb-3">
                            <Info size={16} className="shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                            <div>
                                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                                    Kategori Bawaan Sistem
                                </h3>
                                <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                                    Kategori di bawah ini tidak bisa diubah/dihapus. Nama kategori custom baru tidak boleh nabrak dengan key di sini.
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                            {Object.entries(
                                hardcodedCategories.reduce<Record<string, typeof hardcodedCategories>>((acc, item) => {
                                    if (!acc[item.group]) acc[item.group] = [];
                                    acc[item.group].push(item);
                                    return acc;
                                }, {})
                            ).map(([group, items]) => (
                                <div key={group}>
                                    <div className="font-semibold text-blue-900 dark:text-blue-200 mt-2 mb-1">
                                        {group}
                                    </div>
                                    <ul className="space-y-0.5">
                                        {items.map((item) => (
                                            <li key={item.key} className="text-blue-800 dark:text-blue-300">
                                                • {item.label}{" "}
                                                <code className="text-[10px] opacity-60">({item.key})</code>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                {/* ── Footer ─────────────────────────────────────────── */}
                <div className="flex items-center justify-end px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
                    >
                        Tutup
                    </button>
                </div>
            </div>
        </div>
    );
}