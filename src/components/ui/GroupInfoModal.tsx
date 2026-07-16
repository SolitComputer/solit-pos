"use client";

import { useEffect, useMemo, useState } from "react";

interface GroupMember {
    id: string;
    name: string;
    role: string;
    group_role: "owner" | "member";
    joined_at: string;
}

interface AddableUser { id: string; name: string; role: string; }

interface GroupInfoModalProps {
    groupId: string;
    onClose: () => void;
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

function getInitials(name: string): string {
    return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

export function GroupInfoModal({ groupId, onClose }: GroupInfoModalProps) {
    const [loading, setLoading] = useState(true);
    const [group, setGroup] = useState<any>(null);
    const [members, setMembers] = useState<GroupMember[]>([]);
    const [error, setError] = useState<string | null>(null);

    // ── Tambah anggota ──
    const [showAddPanel, setShowAddPanel] = useState(false);
    const [addableUsers, setAddableUsers] = useState<AddableUser[]>([]);
    const [addableLoading, setAddableLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    const loadGroup = () => {
        setLoading(true);
        fetch(`/api/chat-groups/${groupId}`)
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    setGroup(data.group);
                    setMembers(data.members);
                } else {
                    setError(data.message ?? "Gagal memuat info grup");
                }
            })
            .catch(() => setError("Terjadi kesalahan jaringan"))
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadGroup(); }, [groupId]);

    const canManage = group?.my_role === "owner";

    const openAddPanel = () => {
        setShowAddPanel(true);
        setAddError(null);
        setSelected(new Set());
        setAddableLoading(true);
        fetch("/api/chat-groups/addable-members")
            .then(r => r.json())
            .then(data => { if (data.success) setAddableUsers(data.users); })
            .finally(() => setAddableLoading(false));
    };

    const existingMemberIds = useMemo(() => new Set(members.map(m => m.id)), [members]);

    const filteredAddable = useMemo(() =>
        addableUsers
            .filter(u => !existingMemberIds.has(u.id))
            .filter(u =>
                u.name.toLowerCase().includes(search.toLowerCase()) ||
                (ROLE_LABEL[u.role] ?? u.role).toLowerCase().includes(search.toLowerCase())
            ),
        [addableUsers, existingMemberIds, search]
    );

    const toggle = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleAddMembers = async () => {
        if (selected.size === 0) { setAddError("Pilih minimal 1 anggota"); return; }
        setSaving(true);
        setAddError(null);
        try {
            const res = await fetch(`/api/chat-groups/${groupId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "add_members", member_ids: Array.from(selected) }),
            });
            const data = await res.json();
            if (!data.success) { setAddError(data.message ?? "Gagal menambahkan anggota"); return; }
            setShowAddPanel(false);
            loadGroup();
        } catch {
            setAddError("Terjadi kesalahan jaringan");
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
                    <div className="min-w-0">
                        <h3 className="text-sm font-black text-slate-800 truncate">
                            {showAddPanel ? "Tambah Anggota" : (group?.name ?? "Info Grup")}
                        </h3>
                        {!showAddPanel && group?.description && (
                            <p className="text-[11px] text-slate-400 mt-0.5 truncate">{group.description}</p>
                        )}
                    </div>
                    <button
                        onClick={() => showAddPanel ? setShowAddPanel(false) : onClose()}
                        className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition flex-shrink-0">
                        {showAddPanel ? (
                            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        )}
                    </button>
                </div>

                {!showAddPanel ? (
                    <>
                        <div className="px-5 pt-3 pb-1 flex-shrink-0 flex items-center justify-between">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {members.length} Anggota
                            </p>
                            {canManage && (
                                <button onClick={openAddPanel}
                                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 transition flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Tambah
                                </button>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-2">
                            {loading ? (
                                <div className="flex justify-center py-8">
                                    <div className="w-5 h-5 rounded-full animate-spin" style={{ border: "2px solid #e2e8f0", borderTopColor: "#6366f1" }} />
                                </div>
                            ) : error ? (
                                <p className="text-xs text-red-500 text-center py-8">{error}</p>
                            ) : members.length === 0 ? (
                                <p className="text-xs text-slate-400 text-center py-8">Belum ada anggota</p>
                            ) : members.map(m => (
                                <div key={m.id} className="flex items-center gap-3 py-2.5">
                                    <div className="w-9 h-9 flex items-center justify-center flex-shrink-0 text-white font-bold text-xs"
                                        style={{ borderRadius: 10, background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
                                        {getInitials(m.name)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-slate-800 truncate">{m.name}</p>
                                        <p className="text-[10px] text-slate-400">{ROLE_LABEL[m.role] ?? m.role}</p>
                                    </div>
                                    {m.group_role === "owner" && (
                                        <span className="text-[9px] font-bold text-indigo-600 px-2 py-0.5 rounded-full flex-shrink-0"
                                            style={{ background: "#eef2ff" }}>
                                            Pembuat
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
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
                            {addableLoading ? (
                                <div className="flex justify-center py-8">
                                    <div className="w-5 h-5 rounded-full animate-spin" style={{ border: "2px solid #e2e8f0", borderTopColor: "#6366f1" }} />
                                </div>
                            ) : filteredAddable.length === 0 ? (
                                <p className="text-xs text-slate-400 text-center py-8">
                                    Tidak ada anggota lain yang bisa ditambahkan
                                </p>
                            ) : filteredAddable.map(u => (
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

                        {addError && (
                            <div className="mx-5 mb-2 px-3 py-2 rounded-xl text-[11px] font-medium text-red-600" style={{ background: "#fef2f2" }}>
                                {addError}
                            </div>
                        )}

                        <div className="px-5 py-4 flex-shrink-0" style={{ borderTop: "1px solid #f0f0f8" }}>
                            <button onClick={handleAddMembers} disabled={saving}
                                className="w-full h-11 rounded-xl text-white text-sm font-bold transition hover:scale-[1.01] disabled:opacity-50"
                                style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
                                {saving ? "Menambahkan..." : "Tambahkan Anggota"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}