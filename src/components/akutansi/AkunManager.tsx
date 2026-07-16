"use client";

import { useCallback, useEffect, useState } from "react";
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER } from "@/lib/accounting";

interface AccountRow {
    code: string;
    name: string;
    type: string;
    is_builtin?: boolean;
}

export default function AkunManager() {
    const [accounts, setAccounts] = useState<AccountRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<AccountRow | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/akutansi/accounts");
            const json = await res.json();
            setAccounts(json.success ? json.data ?? [] : []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 3000);
        return () => clearTimeout(t);
    }, [toast]);

    const handleDelete = async (acc: AccountRow) => {
        const warning = acc.is_builtin
            ? `⚠️ "${acc.code} · ${acc.name}" adalah akun BAWAAN sistem. Kalau akun ini masih dipakai untuk pencatatan otomatis (transaksi/service/cashflow), transaksi baru akan GAGAL tercatat setelah dihapus. Yakin tetap hapus?`
            : `Hapus akun "${acc.code} · ${acc.name}"?\n\nTidak bisa dihapus kalau sudah pernah dipakai di jurnal.`;

        if (!confirm(warning)) return;
        try {
            const res = await fetch(`/api/akutansi/accounts/${acc.code}`, { method: "DELETE" });
            const json = await res.json();
            if (!json.success) { setToast(json.message ?? "Gagal menghapus"); return; }
            setToast("Akun dihapus");
            load();
        } catch {
            setToast("Koneksi bermasalah");
        }
    };

    const filtered = accounts.filter((a) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return a.code.includes(q) || a.name.toLowerCase().includes(q);
    });

    return (
        <div className="space-y-4">
            {toast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg">
                    {toast}
                </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 leading-relaxed">
                ⚠️ Semua akun (termasuk bawaan) sekarang bisa diedit — nama, tipe, <b>maupun kode</b> — dan dihapus. Mengubah/menghapus akun yang dipakai sistem untuk pencatatan otomatis (110, 410, dst) bisa membuat transaksi baru gagal tercatat. Berhati-hatilah.
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-3 flex gap-2">
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari kode / nama akun..."
                    className="flex-1 h-10 border border-gray-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
                />
                <button
                    onClick={() => { setEditing(null); setShowForm(true); }}
                    className="h-10 px-4 rounded-lg bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 transition whitespace-nowrap"
                >
                    + Akun Baru
                </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="border-b-2 border-gray-200 bg-gray-50">
                                <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[100px]">Kode</th>
                                <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider">Nama Akun</th>
                                <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[160px]">Tipe</th>
                                <th className="px-4 py-3 text-center text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[100px]">Sumber</th>
                                <th className="px-4 py-3 text-center text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[100px]">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="border-b border-gray-50">
                                        {Array.from({ length: 5 }).map((__, j) => (
                                            <td key={j} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded animate-pulse" /></td>
                                        ))}
                                    </tr>
                                ))
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={5} className="py-14 text-center text-sm text-gray-400">Tidak ada akun ditemukan</td></tr>
                            ) : (
                                filtered.map((a) => (
                                    <tr key={a.code} className="hover:bg-blue-50/30 transition border-b border-gray-50">
                                        <td className="px-4 py-2.5 text-[12px] font-mono font-bold text-gray-800">{a.code}</td>
                                        <td className="px-4 py-2.5 text-[12px] text-gray-800">{a.name}</td>
                                        <td className="px-4 py-2.5 text-[11px] text-gray-500">{ACCOUNT_TYPE_LABEL[a.type as keyof typeof ACCOUNT_TYPE_LABEL] ?? a.type}</td>
                                        <td className="px-4 py-2.5 text-center">
                                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${a.is_builtin ? "bg-gray-100 text-gray-500 border-gray-200" : "bg-violet-50 text-violet-700 border-violet-200"}`}>
                                                {a.is_builtin ? "Bawaan" : "Custom"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={() => { setEditing(a); setShowForm(true); }}
                                                    title="Edit akun"
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(a)}
                                                    title="Hapus akun"
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showForm && (
                <AccountFormModal
                    account={editing}
                    onClose={() => setShowForm(false)}
                    onSaved={() => { setShowForm(false); setToast(editing ? "Akun diperbarui" : "Akun dibuat"); load(); }}
                />
            )}
        </div>
    );
}

function AccountFormModal({
    account,
    onClose,
    onSaved,
}: {
    account: AccountRow | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const isEdit = !!account;
    const [code, setCode] = useState(account?.code ?? "");
    const [name, setName] = useState(account?.name ?? "");
    const [type, setType] = useState(account?.type ?? ACCOUNT_TYPE_ORDER[0]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const submit = async () => {
        setError("");
        if (!/^\d{2,6}$/.test(code.trim())) return setError("Kode akun harus angka 2-6 digit");
        if (!name.trim()) return setError("Nama akun wajib diisi");

        if (isEdit && code.trim() !== account!.code) {
            const ok = confirm(
                `⚠️ Kamu mengubah kode akun dari "${account!.code}" menjadi "${code.trim()}".\n\nSemua mutasi jurnal yang sudah tercatat pakai kode "${account!.code}" akan ikut dipindah ke kode baru. Yakin lanjut?`
            );
            if (!ok) return;
        }

        setSaving(true);
        try {
            const url = isEdit ? `/api/akutansi/accounts/${account!.code}` : "/api/akutansi/accounts";
            const body = isEdit
                ? { name: name.trim(), type, new_code: code.trim() !== account!.code ? code.trim() : undefined }
                : { code: code.trim(), name: name.trim(), type };

            const res = await fetch(url, {
                method: isEdit ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!json.success) { setError(json.message ?? "Gagal menyimpan"); return; }
            onSaved();
        } catch {
            setError("Koneksi bermasalah");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 text-sm">{isEdit ? "Edit Akun" : "Akun Baru"}</h3>
                    <button onClick={onClose} className="w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100">✕</button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Kode Akun</label>
                        <input
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                            placeholder="cth: 195"
                            className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-mono"
                        />
                        {isEdit && (
                            <p className="text-[10px] text-amber-600 mt-1">
                                ⚠️ Mengubah kode akan memindahkan semua mutasi jurnal terkait ke kode baru.
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Nama Akun</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="cth: Piutang Lain-lain"
                            className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Tipe Akun</label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                            className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm bg-white"
                        >
                            {ACCOUNT_TYPE_ORDER.map((t) => (
                                <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t as keyof typeof ACCOUNT_TYPE_LABEL] ?? t}</option>
                            ))}
                        </select>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
                    <button onClick={onClose} className="flex-1 h-10 bg-white border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">
                        Batal
                    </button>
                    <button
                        onClick={submit}
                        disabled={saving}
                        className="flex-1 h-10 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 disabled:opacity-40"
                    >
                        {saving ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan Akun"}
                    </button>
                </div>
            </div>
        </div>
    );
}