"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Archive, Search, User, Calendar, UserCog, ArrowLeft, Shield, AlertCircle } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";  

interface ArchivedUser {
    id: string;
    name: string;
    role: string;
    roles: string[];
    email: string | null;
    phone_number: string | null;
    profile_photo_url: string | null;
    deleted_at: string | null;
    deleted_by: string | null;
    deactivated_at: string | null;
    deactivated_by: string | null;
    deactivated_by_name?: string | null;
    created_at: string | null;
    is_active: boolean;
}

const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

// Helper — cek apakah role itu tipe PKL
function isPKLRole(role: string | undefined | null): boolean {
    if (!role) return false;
    const upper = role.toUpperCase().trim();
    return upper.startsWith("PKL") || upper.includes("_PKL") || upper === "EX_PKL";
}

// Helper — format tanggal ke format Indonesia
function formatDate(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

// Helper — ambil initial dari nama (max 2 huruf)
function getInitials(name: string): string {
    const parts = name.replace(/\s*\(Ex.*\)\s*$/, "").trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Helper — bersihkan nama (hilangin suffix Ex untuk display)
function getCleanName(name: string): { clean: string; suffix: string } {
    const match = name.match(/^(.*?)\s*(\(Ex .*?\))\s*$/);
    if (match) {
        return { clean: match[1].trim(), suffix: match[2].trim() };
    }
    return { clean: name, suffix: "" };
}

export default function ArsipUserPage() {
    const router = useRouter();
    const [users, setUsers] = useState<ArchivedUser[]>([]);
    const [allUsersMap, setAllUsersMap] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [search, setSearch] = useState("");
    const [filterType, setFilterType] = useState<"all" | "karyawan" | "pkl">("all");

    // Fetch current user info
    useEffect(() => {
        (async () => {
            try {
                const r = await fetch("/api/auth/me");
                const d = await r.json();
                if (d.success) setCurrentUser(d.user);
            } catch (e) {
                console.error("[arsip user] failed to fetch currentUser:", e);
            }
        })();
    }, []);

    // Fetch archived users + map untuk arsiver
    useEffect(() => {
        if (!currentUser) return;
        const userRoles: string[] = currentUser.roles ?? [currentUser.role];
        const hasAccess = userRoles.some((r) => FULL_ACCESS_ROLES.includes(r));
        if (!hasAccess) {
            setLoading(false);
            return;
        }

        (async () => {
            setLoading(true);
            try {
                // Ambil arsip user
                const r = await fetch("/api/users?trash=1");
                const d = await r.json();
                if (d.success) setUsers(d.users ?? []);

                // Ambil juga user aktif buat lookup nama "diarsipkan oleh"
                const r2 = await fetch("/api/users");
                const d2 = await r2.json();
                if (d2.success) {
                    const map: Record<string, string> = {};
                    (d2.users ?? []).forEach((u: any) => { map[u.id] = u.name; });
                    setAllUsersMap(map);
                }
            } catch (e) {
                console.error("[arsip user] fetch error:", e);
            } finally {
                setLoading(false);
            }
        })();
    }, [currentUser]);

    // Access check
    const userRoles: string[] = currentUser?.roles ?? (currentUser?.role ? [currentUser.role] : []);
    const hasAccess = userRoles.some((r) => FULL_ACCESS_ROLES.includes(r));

    // Filter + Search
    const filtered = useMemo(() => {
        return users.filter((u) => {
            // Search by name
            if (search) {
                const q = search.toLowerCase();
                if (!u.name.toLowerCase().includes(q)) return false;
            }
            // Filter by type
            if (filterType === "karyawan" && isPKLRole(u.role)) return false;
            if (filterType === "pkl" && !isPKLRole(u.role)) return false;
            return true;
        });
    }, [users, search, filterType]);

    // Stats
    const stats = useMemo(() => ({
        total: users.length,
        karyawan: users.filter((u) => !isPKLRole(u.role)).length,
        pkl: users.filter((u) => isPKLRole(u.role)).length,
    }), [users]);

    // ── Render — Loading ───────────────────────────────────────────────────
    if (loading && !currentUser) {
        return (
            <DashboardLayout>           
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-800" />
            </div>
            </DashboardLayout>
        );
    }

    // ── Render — Access Denied ─────────────────────────────────────────────
    if (!hasAccess) {
        return (
                <DashboardLayout>

            <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
                <div className="max-w-md bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                        <Shield className="w-7 h-7 text-red-500" />
                    </div>
                    <h2 className="text-lg font-black text-gray-800 mb-2">Akses Ditolak</h2>
                    <p className="text-sm text-gray-500 mb-4">
                        Halaman Arsip User cuma bisa diakses Admin, Programmer, atau Asisten CEO.
                    </p>
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="text-xs font-bold text-slate-600 border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 transition-all"
                    >
                        Kembali ke Dashboard
                    </button>
                </div>
            </div>
                </DashboardLayout>
        );
    }

    // ── Render — Main Content ──────────────────────────────────────────────
    return (
        <DashboardLayout>
            <div className="p-4 md:p-6">
                {/* HEADER */}
            <div className="max-w-7xl mx-auto mb-6">
                <button
                    onClick={() => router.push("/dashboard/users")}
                    className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-700 mb-3 transition-colors"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Kembali ke Management User
                </button>

                <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
                                <Archive className="w-5 h-5 text-white" />
                            </div>
                            <h1 className="text-xl font-black text-gray-800">Arsip User</h1>
                        </div>
                        <p className="text-xs text-gray-500 ml-12">
                            Karyawan & PKL yang sudah resign. Nama mereka tetap muncul di jurnal, cashflow, dan laporan lama.
                        </p>
                    </div>
                </div>
            </div>

            {/* STATS CARDS */}
            <div className="max-w-7xl mx-auto grid grid-cols-3 gap-3 mb-6">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Arsip</p>
                    <p className="text-2xl font-black text-slate-800">{stats.total}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Ex Karyawan</p>
                    <p className="text-2xl font-black text-slate-700">{stats.karyawan}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Ex PKL</p>
                    <p className="text-2xl font-black text-amber-700">{stats.pkl}</p>
                </div>
            </div>

            {/* TOOLBAR — Search + Filter */}
            <div className="max-w-7xl mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[240px]">
                    <Search className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Cari nama user arsip…"
                        className="w-full pl-9 pr-3 py-2.5 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:border-slate-300 focus:bg-white transition-all"
                    />
                </div>
                <div className="flex items-center gap-0.5 bg-gray-100 p-1 rounded-xl">
                    <button
                        onClick={() => setFilterType("all")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterType === "all" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                    >
                        Semua
                    </button>
                    <button
                        onClick={() => setFilterType("karyawan")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterType === "karyawan" ? "bg-slate-700 text-white shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                    >
                        Ex Karyawan
                    </button>
                    <button
                        onClick={() => setFilterType("pkl")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterType === "pkl" ? "bg-amber-500 text-white shadow-sm" : "text-gray-400 hover:text-amber-600"}`}
                    >
                        Ex PKL
                    </button>
                </div>
            </div>

            {/* CONTENT — Table */}
            <div className="max-w-7xl mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array(5).fill(0).map((_, i) => (
                            <div key={i} className="h-16 bg-gray-50 rounded-2xl animate-pulse" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-16 flex flex-col items-center justify-center text-center px-6">
                        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                            <Archive className="w-7 h-7 text-gray-300" />
                        </div>
                        <p className="font-bold text-gray-500 mb-1">
                            {search || filterType !== "all" ? "Tidak ada hasil yang cocok" : "Belum ada user yang diarsipkan"}
                        </p>
                        <p className="text-xs text-gray-400">
                            {search || filterType !== "all"
                                ? "Coba ubah kata kunci atau filter"
                                : "User yang diarsipkan dari Management User bakal muncul di sini"}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/60">
                                    <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-8">#</th>
                                    <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                                    <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Role Lama</th>
                                    <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Tanggal Diarsipkan</th>
                                    <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Diarsipkan Oleh</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map((u, i) => {
                                    const { clean, suffix } = getCleanName(u.name);
                                    const pkl = isPKLRole(u.role);
                                    return (
                                        <tr key={u.id} className="hover:bg-gray-50/60 transition-colors duration-200">
                                            <td className="px-6 py-4 text-[11px] text-gray-400 font-black">{i + 1}</td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-md ${pkl ? "bg-gradient-to-br from-amber-500 to-orange-600" : "bg-gradient-to-br from-slate-700 to-slate-900"}`}>
                                                        {getInitials(clean)}
                                                    </div>
                                                    <div>
                                                        <span className="font-bold text-gray-800 block">{clean}</span>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 ${pkl ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}>
                                                            {suffix || "(Diarsipkan)"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="text-xs font-bold text-gray-500">
                                                    {u.role || "—"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                                    <Calendar className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                                                    {formatDate(u.deleted_at)}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                                    <UserCog className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                                                    {u.deleted_by ? (allUsersMap[u.deleted_by] ?? "—") : "—"}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* INFO FOOTER */}
            <div className="max-w-7xl mx-auto mt-4 flex items-start gap-2 px-4 py-3 bg-slate-50 rounded-xl border border-slate-100">
                <AlertCircle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                    <b>Info:</b> User yang diarsipkan sudah <b>tidak bisa login</b> ke sistem, dan datanya tidak muncul lagi di Absensi, Laporan, dan modul aktif lainnya. Namun nama mereka <b>tetap muncul</b> di jurnal akuntansi, cashflow, invoice, dan laporan historis untuk keperluan audit. Fitur arsip ini <b>tidak bisa di-undo</b> — kalau ada user yang salah diarsipkan, hubungi programmer untuk restore manual via database.
                </p>
            </div>
            </div>
        </DashboardLayout>
    );
}