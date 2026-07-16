"use client";

import { useEffect, useMemo, useState } from "react";

interface AddableUser { id: string; name: string; role: string; }

interface CreateGroupModalProps {
    onClose: () => void;
    onCreated: (group: any) => void;
}

const ROLE_LABEL: Record<string, string> = {
    ADMIN: "Admin", PROGRAMMER: "Programmer", ASISTEN_CEO: "Asisten CEO",
    KEPALA_SALES: "Kepala Sales", KEPALA_MARKETING: "Kepala Marketing",
    KEPALA_TEKNISI: "Kepala Teknisi", CREW_SALES: "Crew Sales",
    SOTECH: "Sotech", ACCOUNTING: "Accounting",
    PENGELOLA_BARANG: "Pengelola Barang", TEKNISI: "Teknisi",
    PENGANTARAN: "Pengantaran", MARKETING: "Marketing", KEBERSIHAN: "Kebersihan",
    PENYEDIA_BARANG: "Penyedia Barang", KEPALA_PENYEDIA_BARANG: "Kepala Penyedia Barang",
    KONTEN: "Konten", KEPALA_ONPOINT: "Kepala Onpoint", ONPOINT: "Onpoint",
    KEPALA_SOTECH: "Kepala Sotech", PKL: "PKL", CUSTOMER_SERVICE: "Customer Service",
};

export function CreateGroupModal({ onClose, onCreated }: CreateGroupModalProps) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [users, setUsers] = useState<AddableUser[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/chat-groups/addable-members")
            .then(r => r.json())
            .then(data => { if (data.success) setUsers(data.users); })
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(() => users.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        (ROLE_LABEL[u.role] ?? u.role).toLowerCase().includes(search.toLowerCase())
    ), [users, search]);

    const toggle = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleCreate = async () => {
        setError(null);
        if (!name.trim()) { setError("Nama grup wajib diisi"); return; }
        if (selected.size === 0) { setError("Pilih minimal 1 anggota"); return; }
        setSaving(true);
        try {
            const res = await fetch("/api/chat-groups", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim(),
                    member_ids: Array.from(selected),
                }),
            });
            const data = await res.json();
            if (!data.success) { setError(data.message ?? "Gagal membuat grup"); return; }
            onCreated(data.group);
        } catch {
            setError("Terjadi kesalahan jaringan");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
            style={{ backdropFilter: "blur(8px)", background: "rgba(10,8,30,0.6)" }}
            onClick={onClose}>
            <div className="w-full max-w-md max-h-[85vh] flex flex-col bg-white overflow-hidden"
                style={{ borderRadius: 24, boxShadow: "0 30px 90px rgba(10,8,30,0.35)" }}
                onClick={e => e.stopPropagation()}>

                <div className="px-5 py-4 flex items-center justify-between flex-shrink-0"
                    style={{ borderBottom: "1px solid #f0f0f8" }}>
                    <h3 className="text-sm font-black text-slate-800">Buat Grup Baru</h3>
                    <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition">
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="px-5 py-4 space-y-3 flex-shrink-0" style={{ borderBottom: "1px solid #f0f0f8" }}>
                    <input
                        value={name} onChange={e => setName(e.target.value)}
                        placeholder="Nama grup (contoh: Divisi Sales)"
                        maxLength={60}
                        className="w-full h-10 rounded-xl px-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-200"
                        style={{ background: "#f5f7ff", border: "1.5px solid #e8ecff" }}
                    />
                    <input
                        value={description} onChange={e => setDescription(e.target.value)}
                        placeholder="Deskripsi (opsional)"
                        maxLength={150}
                        className="w-full h-10 rounded-xl px-3.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                        style={{ background: "#f5f7ff", border: "1.5px solid #e8ecff" }}
                    />
                </div>

                <div className="px-5 pt-3 flex-shrink-0">
                    <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Cari anggota..."
                        className="w-full h-9 rounded-xl px-3.5 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-200"
                        style={{ background: "#f1f5f9", border: "1px solid #e2e8f0" }}
                    />
                    <p className="text-[10px] text-slate-400 mt-2 font-semibold">
                        {selected.size} anggota dipilih
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-2">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="w-5 h-5 rounded-full animate-spin" style={{ border: "2px solid #e2e8f0", borderTopColor: "#6366f1" }} />
                        </div>
                    ) : filtered.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-8">
                            Tidak ada anggota yang bisa ditambahkan
                        </p>
                    ) : filtered.map(u => (
                        <label key={u.id} className="flex items-center gap-3 py-2 cursor-pointer">
                            <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)}
                                className="w-4 h-4 rounded accent-indigo-600" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-800 truncate">{u.name}</p>
                                <p className="text-[10px] text-slate-400">{ROLE_LABEL[u.role] ?? u.role}</p>
                            </div>
                        </label>
                    ))}
                </div>

                {error && (
                    <div className="mx-5 mb-2 px-3 py-2 rounded-xl text-[11px] font-medium text-red-600" style={{ background: "#fef2f2" }}>
                        {error}
                    </div>
                )}

                <div className="px-5 py-4 flex-shrink-0" style={{ borderTop: "1px solid #f0f0f8" }}>
                    <button onClick={handleCreate} disabled={saving}
                        className="w-full h-11 rounded-xl text-white text-sm font-bold transition hover:scale-[1.01] disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
                        {saving ? "Membuat..." : "Buat Grup"}
                    </button>
                </div>
            </div>
        </div>
    );
}