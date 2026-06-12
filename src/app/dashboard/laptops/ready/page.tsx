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
    PACKING: { badge: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500", label: "📦 Packing" },
};

const inputCls = "w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition";
const labelCls = "block text-xs font-medium text-gray-500 mb-1.5";

// ─── Sub-components ───────────────────────────────────────────────────────────
function AlertModal({ message, onClose }: { message: string; onClose: () => void }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center animate-scaleIn">
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm font-medium mb-5">{message}</p>
                <button onClick={onClose} className="w-full h-11 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 transition-all duration-200 shadow-md">OK</button>
            </div>
        </div>
    );
}

function SkeletonRows() {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                            {["Laptop", "SN", "Grade", "Harga Jual", "Status", "Pemesan", "Aksi"].map(h => (
                                <th key={h} className="px-4 py-3 text-left"><div className="h-3 bg-gray-200 rounded w-20 animate-pulse" /></th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {[...Array(6)].map((_, i) => (
                            <tr key={i} className="animate-pulse">
                                <td className="px-4 py-3.5"><div className="h-4 bg-gray-100 rounded w-40" /></td>
                                <td className="px-4 py-3.5"><div className="h-3 bg-gray-100 rounded w-28" /></td>
                                <td className="px-4 py-3.5"><div className="h-5 bg-gray-100 rounded-full w-16" /></td>
                                <td className="px-4 py-3.5"><div className="h-3 bg-gray-100 rounded w-24 ml-auto" /></td>
                                <td className="px-4 py-3.5"><div className="h-5 bg-gray-100 rounded-full w-20" /></td>
                                <td className="px-4 py-3.5"><div className="h-3 bg-gray-100 rounded w-24" /></td>
                                <td className="px-4 py-3.5"><div className="flex gap-1 justify-end"><div className="h-7 bg-gray-100 rounded-lg w-12" /><div className="h-7 bg-gray-100 rounded-lg w-12" /></div></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function StatCard({ label, value, icon, color, bg, bar }: any) {
    return (
        <div className={`${bg} rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-4 relative overflow-hidden group`}>
            <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${bar} opacity-60 group-hover:opacity-100 transition-opacity`} />
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                    <p className={`text-2xl font-extrabold mt-1 ${color}`}>{value}</p>
                </div>
                <div className="text-2xl opacity-60 group-hover:opacity-100 transition-opacity">{icon}</div>
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

    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState("ALL");
    const [filterGrade, setFilterGrade] = useState("ALL");

    const [alertMsg, setAlertMsg] = useState<string | null>(null);
    const [reserveTarget, setReserveTarget] = useState<{ unit: LaptopUnit; type: "RESERVED" | "HELD" } | null>(null);
    const [confirmTarget, setConfirmTarget] = useState<LaptopUnit | null>(null);
    const [confirmedUnitIds, setConfirmedUnitIds] = useState<Set<string>>(new Set());

    const canCreateTx = userRole ? hasPermission(userRole, PERMISSIONS.RESERVE_UNIT) : false;
    const canConfirmTx = userRole ? hasPermission(userRole, PERMISSIONS.EDIT_TRANSACTION) : false;

    useEffect(() => {
        fetch("/api/auth/me")
            .then(r => r.json())
            .then(r => { setUserRole(r.user?.role ?? null); setSalesName(r.user?.name ?? ""); })
            .catch(() => setUserRole(null));
    }, []);

    const fetchUnits = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/laptops/ready-units");
            const result = await res.json();
            if (result.success) {
                setUnits((result.data || []).map((u: LaptopUnit) => ({
                    ...u,
                    purchase_price: Math.round(Number(u.purchase_price) || 0),
                    selling_price: Math.round(Number(u.selling_price) || 0),
                })));
            }
        } catch { setUnits([]); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { fetchUnits(); }, []);

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
        const order: Record<string, number> = { SIAP_JUAL: 0, HELD: 1, RESERVED: 2, SOLD: 3 };
        list.sort((a, b) => {
            const d = (order[a.status] ?? 9) - (order[b.status] ?? 9);
            if (d !== 0) return d;
            return (a.laptop?.laptop_name ?? "").localeCompare(b.laptop?.laptop_name ?? "", "id");
        });
        return list;
    }, [units, filterStatus, filterGrade, search]);

    const counts = {
        all: units.length,
        siap: units.filter(u => u.status === "SIAP_JUAL").length,
        reserved: units.filter(u => u.status === "RESERVED").length,
        held: units.filter(u => u.status === "HELD").length,
        packing: units.filter(u => u.status === "PACKING").length,
    };

    return (
        <DashboardLayout>
            <style>{`
                @keyframes fadeIn  { from { opacity:0; transform:scale(0.95) }  to { opacity:1; transform:scale(1) } }
                @keyframes scaleIn { from { opacity:0; transform:scale(0.9) }   to { opacity:1; transform:scale(1) } }
                @keyframes slideIn { from { opacity:0; transform:translateX(-30px) } to { opacity:1; transform:translateX(0) } }
                @keyframes fadeUp  { from { opacity:0; transform:translateY(15px) }  to { opacity:1; transform:translateY(0) } }
                @keyframes slideUp { from { opacity:0; transform:translateY(100%) }  to { opacity:1; transform:translateY(0) } }
                .animate-fadeIn  { animation: fadeIn  0.3s ease-out; }
                .animate-scaleIn { animation: scaleIn 0.25s ease-out; }
                .animate-slideIn { animation: slideIn 0.4s ease-out; }
                .animate-fadeUp  { animation: fadeUp  0.4s ease-out; }
                .animate-slideUp { animation: slideUp 0.3s ease-out; }
                .table-scroll { scrollbar-width:thin; scrollbar-color:#cbd5e1 #f1f5f9; }
                .table-scroll::-webkit-scrollbar { height:8px; width:8px; }
                .table-scroll::-webkit-scrollbar-track { background:#f1f5f9; border-radius:10px; }
                .table-scroll::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:10px; }
                .data-row { transition: all 0.2s ease; }
                .data-row:hover { transform: translateX(2px); }
            `}</style>

            <main className="min-h-screen bg-white p-4 sm:p-6 lg:p-8">
                <div className="max-w-full mx-auto space-y-5">

                    {/* Header */}
                    <div className="flex flex-wrap items-end justify-between gap-3 animate-slideIn">
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-7 bg-gray-300 rounded-full" />
                            <div className="w-8 h-8 bg-gray-800 rounded-xl flex items-center justify-center shadow-sm">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                    <path d="M9 12l2 2 4-4" /><rect x="2" y="3" width="20" height="14" rx="2" />
                                    <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-800">Laptop Siap Jual</h1>
                                <p className="text-xs text-gray-400 mt-0.5">Unit tersedia, dipesan, dan diambil reseller</p>
                            </div>
                        </div>
                        <button onClick={fetchUnits} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-2 rounded-xl transition-all bg-white hover:bg-gray-50 group">
                            <svg className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                        </button>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fadeUp">
                        <StatCard label="Total Unit" value={counts.all} icon="💻" color="text-gray-800" bg="bg-white" bar="bg-gray-400" />
                        <StatCard label="Siap Jual" value={counts.siap} icon="✅" color="text-emerald-600" bg="bg-emerald-50" bar="bg-emerald-500" />
                        <StatCard label="Dipesan" value={counts.reserved} icon="🔒" color="text-violet-600" bg="bg-violet-50" bar="bg-violet-500" />
                        <StatCard label="Diambil" value={counts.held} icon="📦" color="text-orange-600" bg="bg-orange-50" bar="bg-orange-500" />
                    </div>

                    {/* Filter */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                        <div className="flex flex-wrap gap-2">
                            {[
                                { value: "ALL", label: "Semua", count: counts.all },
                                { value: "SIAP_JUAL", label: "✅ Siap Jual", count: counts.siap },
                                { value: "RESERVED", label: "🔒 Dipesan", count: counts.reserved },
                                { value: "HELD", label: "📦 Diambil", count: counts.held },
                                { value: "PACKING", label: "📦 Packing", count: counts.packing },
                            ].map(opt => (
                                <button key={opt.value} onClick={() => setFilterStatus(opt.value)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${filterStatus === opt.value ? "bg-gray-800 text-white shadow-md scale-105" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>
                                    <span>{opt.label}</span>
                                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${filterStatus === opt.value ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>{opt.count}</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <div className="relative flex-1 group">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input type="text" placeholder="Cari nama laptop, SN, atau pemesan..." value={search} onChange={e => setSearch(e.target.value)}
                                    className="w-full h-10 border border-gray-200 rounded-xl pl-9 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition" />
                            </div>
                            <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)}
                                className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 text-gray-700 focus:outline-none transition cursor-pointer">
                                <option value="ALL">⭐ Semua Grade</option>
                                <option value="A">🏆 Grade A</option>
                                <option value="B">👍 Grade B</option>
                                <option value="C">⚠️ Grade C</option>
                            </select>
                            {(search || filterStatus !== "ALL" || filterGrade !== "ALL") && (
                                <button onClick={() => { setSearch(""); setFilterStatus("ALL"); setFilterGrade("ALL"); }}
                                    className="h-10 px-4 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition flex items-center gap-1.5">
                                    ✕ Reset
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Table */}
                    {isLoading ? <SkeletonRows /> : filtered.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
                            <div className="text-6xl mb-4">💻</div>
                            <p className="text-gray-500 font-semibold">Tidak ada unit ditemukan</p>
                            <p className="text-gray-400 text-sm mt-2">Coba ubah filter pencarian</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto table-scroll">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-100">
                                            <th className="px-4 py-3 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-10">No</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Laptop</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Laptop</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Serial Number</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Grade</th>
                                            <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Harga Jual</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Pemesan</th>
                                            <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">

                                        {filtered.map((unit, idx) => {
                                            const st = STATUS_CONFIG[unit.status];
                                            const isAvailable = unit.status === "SIAP_JUAL";
                                            const isPending = unit.status === "RESERVED" || unit.status === "HELD" || unit.status === "PACKING";
                                            return (
                                                <tr key={unit.id} className={`data-row ${unit.status === "RESERVED" ? "bg-violet-50/30 hover:bg-violet-50/50" : unit.status === "HELD" ? "bg-orange-50/30 hover:bg-orange-50/50" : "hover:bg-gray-50/70"}`}>
                                                    <td className="px-4 py-3.5 text-center whitespace-nowrap w-10">
                                                        <span className="text-xs font-medium text-gray-400">{idx + 1}</span>
                                                    </td>
                                                    <td className="px-4 py-3.5 max-w-[220px]">
                                                        <p className="font-semibold text-gray-800 truncate text-sm" title={unit.laptop?.laptop_name}>{unit.laptop?.laptop_name || "—"}</p>
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {unit.laptop?.brand && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{unit.laptop.brand}</span>}
                                                            {unit.laptop?.cpu && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{unit.laptop.cpu}</span>}
                                                            {unit.laptop?.ram && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{unit.laptop.ram}</span>}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        <code className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded-md">{unit.serial_number}</code>
                                                    </td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${GRADE_BADGE[unit.grade] || ""}`}>
                                                            {unit.grade === "A" ? "🏆" : unit.grade === "B" ? "👍" : "⚠️"} Grade {unit.grade}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right font-bold text-gray-800 whitespace-nowrap tabular-nums">{fmt(unit.selling_price)}</td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        {st && (
                                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${st.badge}`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${st.dot} animate-pulse`} />{st.label}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        {isPending && unit.reserved_by ? (
                                                            <div>
                                                                <p className="text-xs font-semibold text-gray-700">{unit.reserved_by}</p>
                                                                {unit.reserved_invoice && <p className="text-[10px] text-gray-400 font-mono mt-0.5">{unit.reserved_invoice}</p>}
                                                            </div>
                                                        ) : <span className="text-gray-300 text-xs">—</span>}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            {isAvailable && canCreateTx && (
                                                                <>
                                                                    <button onClick={() => setReserveTarget({ unit, type: "RESERVED" })}
                                                                        className="px-2.5 py-1.5 text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition">
                                                                        🔒 DP
                                                                    </button>
                                                                    <button onClick={() => setReserveTarget({ unit, type: "HELD" })}
                                                                        className="px-2.5 py-1.5 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition">
                                                                        📦 Ambil
                                                                    </button>
                                                                </>
                                                            )}
                                                            {isPending && canConfirmTx && !confirmedUnitIds.has(unit.id) && (
                                                                <button onClick={() => setConfirmTarget(unit)}
                                                                    className="px-2.5 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">
                                                                    ✓ Lunas
                                                                </button>
                                                            )}
                                                            {isPending && confirmedUnitIds.has(unit.id) && (
                                                                <span className="px-2.5 py-1.5 text-xs font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-1">
                                                                    <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
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
                            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
                                <p className="text-xs text-gray-400">Menampilkan <span className="font-semibold text-gray-600">{filtered.length}</span> dari <span className="font-semibold text-gray-600">{units.length}</span> unit</p>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
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

// ─── ReserveModal ─────────────────────────────────────────────────────────────
function ReserveModal({ unit, type, salesName, onClose, onSuccess }: {
    unit: LaptopUnit; type: "RESERVED" | "HELD"; salesName: string;
    onClose: () => void; onSuccess: () => void;
}) {
    const isDP = type === "RESERVED";
    const [form, setForm] = useState({
        customer_name: "",
        customer_phone: "",
        company_name: "Solit",
        dp_amount: "",
        deal_price: String(unit.selling_price || ""),
        payment_method: "TRANSFER",
        source_platform: "",
        notes: "",
        software_request: "",
        pickup_method: "COD",
        pickup_date: "",
        pickup_time: "",
        pickup_location: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const set = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm(p => ({ ...p, [e.target.name]: e.target.value }));

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!form.customer_name.trim()) { setError("Nama pelanggan wajib diisi"); return; }
        if (isDP && !form.dp_amount) { setError("Jumlah DP wajib diisi"); return; }
        if (!form.deal_price) { setError("Harga deal wajib diisi"); return; }

        setLoading(true); setError("");
        try {
            const res = await fetch("/api/units/reserve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    unit_id: unit.id, type,
                    customer_name: form.customer_name.trim(),
                    customer_phone: form.customer_phone.trim() || null,
                    company_name: form.company_name.trim() || null,
                    dp_amount: isDP ? Number(form.dp_amount) : undefined,
                    deal_price: Number(form.deal_price),
                    payment_method: form.payment_method,
                    source_platform: form.source_platform || null,
                    notes: form.notes || null,
                    sales_name: salesName,
                    software_request: form.software_request || null,
                    pickup_method: form.pickup_method || null,
                    pickup_date: form.pickup_date || null,
                    pickup_time: form.pickup_time || null,
                    pickup_location: form.pickup_location || null,
                }),
            });
            const result = await res.json();
            if (!result.success) { setError(result.message || "Gagal"); return; }
            onSuccess(); onClose();
        } catch { setError("Terjadi kesalahan koneksi"); }
        finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-fadeIn">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[94dvh] overflow-hidden animate-slideUp">

                {/* Header */}
                <div className={`px-5 py-4 flex-shrink-0 ${isDP ? "bg-gray-800" : "bg-gray-700"} text-white`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl">{isDP ? "🔒" : "📦"}</div>
                            <div>
                                <h2 className="font-bold text-base">{isDP ? "Pesanan DP" : "Ambil Dulu"}</h2>
                                <p className="text-xs text-white/70 mt-0.5">{isDP ? "Unit dikunci, pembayaran sebagian" : "Barang dibawa, pembayaran menyusul"}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/20 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                {/* Unit info */}
                <div className="px-5 pt-4 pb-0 flex-shrink-0">
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-800 truncate">{unit.laptop?.laptop_name || "—"}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <code className="text-[11px] font-mono bg-gray-100 px-2 py-0.5 rounded-md text-gray-700">SN: {unit.serial_number}</code>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${GRADE_BADGE[unit.grade] || ""}`}>Grade {unit.grade}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ✅ Form — semua field lengkap */}
                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-4 space-y-4 overscroll-contain">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5 rounded-xl flex items-center gap-2">
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                            {error}
                        </div>
                    )}

                    {/* Nama Pelanggan */}
                    <div>
                        <label className={labelCls}>Nama Pelanggan / Reseller <span className="text-red-400">*</span></label>
                        <input name="customer_name" value={form.customer_name} onChange={set} placeholder="Nama lengkap..." autoFocus className={inputCls} required />
                    </div>

                    {/* No WA */}
                    <div>
                        <label className={labelCls}>No. WhatsApp</label>
                        <input name="customer_phone" value={form.customer_phone} onChange={set} placeholder="08xxxxxxxxxx" className={inputCls} />
                    </div>

                    {/* Harga Deal + DP (jika tipe DP) */}
                    <div className={`grid gap-3 ${isDP ? "grid-cols-2" : "grid-cols-1"}`}>
                        <div>
                            <label className={labelCls}>Harga Deal (Rp) <span className="text-red-400">*</span></label>
                            <input name="deal_price" type="number" value={form.deal_price} onChange={set} placeholder={String(unit.selling_price)} className={inputCls} required />
                        </div>
                        {isDP && (
                            <div>
                                <label className={labelCls}>Jumlah DP (Rp) <span className="text-red-400">*</span></label>
                                <input name="dp_amount" type="number" value={form.dp_amount} onChange={set} placeholder="Nominal DP..." className={inputCls} required />
                            </div>
                        )}
                    </div>

                    {/* Metode Bayar + Sumber */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls}>Metode Pembayaran</label>
                            <select name="payment_method" value={form.payment_method} onChange={set} className={inputCls}>
                                <option value="TRANSFER">Transfer</option>
                                <option value="TUNAI">Tunai</option>
                                <option value="QRIS">QRIS</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Sumber / Platform</label>
                            <select name="source_platform" value={form.source_platform} onChange={set} className={inputCls}>
                                <option value="">— Pilih —</option>
                                <option value="WhatsApp">WhatsApp</option>
                                <option value="Shopee">Shopee</option>
                                <option value="Tokopedia">Tokopedia</option>
                                <option value="Facebook">Facebook</option>
                                <option value="COD">COD</option>
                                <option value="Lainnya">Lainnya</option>
                            </select>
                        </div>
                    </div>

                    {/* Pickup */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls}>Metode Pengambilan</label>
                            <select name="pickup_method" value={form.pickup_method} onChange={set} className={inputCls}>
                                <option value="COD">COD</option>
                                <option value="DATANG">Datang Langsung</option>
                                <option value="PENGIRIMAN">Pengiriman</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Tanggal Ambil</label>
                            <input name="pickup_date" type="date" value={form.pickup_date} onChange={set} className={inputCls} />
                        </div>
                    </div>

                    {/* Software & Catatan */}
                    <div>
                        <label className={labelCls}>Request Software</label>
                        <input name="software_request" value={form.software_request} onChange={set} placeholder="e.g. Office, Windows 11..." className={inputCls} />
                    </div>
                    <div>
                        <label className={labelCls}>Catatan</label>
                        <input name="notes" value={form.notes} onChange={set} placeholder="Catatan tambahan..." className={inputCls} />
                    </div>
                </form>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0 bg-white">
                    <button type="button" onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
                    <button type="button" onClick={() => handleSubmit()} disabled={loading}
                        className={`flex-1 h-11 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-md ${isDP ? "bg-gray-800 hover:bg-gray-900" : "bg-gray-700 hover:bg-gray-800"}`}>
                        {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : isDP ? "Kunci Unit (DP)" : "Konfirmasi Ambil"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── ConfirmPaymentModal ──────────────────────────────────────────────────────
function ConfirmPaymentModal({ unit, onClose, onSuccess }: {
    unit: LaptopUnit; onClose: () => void; onSuccess: () => void;
}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [paymentProof, setPaymentProof] = useState<string | null>(null);
    const [uploadingProof, setUploadingProof] = useState(false);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

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
            else throw new Error("URL tidak ditemukan");
        } catch { setError("Gagal upload foto"); }
        finally { setUploadingProof(false); }
    };

    const handleConfirm = async () => {
        if (!unit.reserved_invoice) { setError("Invoice tidak ditemukan"); return; }
        if (!unit.serial_number) { setError("Serial number tidak ditemukan"); return; }
        setLoading(true); setError("");
        try {
            const res = await fetch("/api/units/confirm-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    invoice_number: unit.reserved_invoice,
                    serial_number: unit.serial_number,
                    payment_photo: paymentProof || null,
                }),
            });
            const result = await res.json();
            if (!result.success) { setError(result.message || "Gagal"); return; }
            onSuccess(); onClose();
        } catch { setError("Terjadi kesalahan koneksi"); }
        finally { setLoading(false); }
    };

    const statusColor = unit.status === "RESERVED" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-orange-50 text-orange-700 border-orange-200";
    const statusDot = unit.status === "RESERVED" ? "bg-violet-500" : "bg-orange-500";
    const statusLabel = unit.status === "RESERVED" ? "DP" : "Ambil Dulu";

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center animate-fadeIn">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:mx-4 overflow-hidden animate-slideUp">

                <div className="bg-gray-800 px-5 py-4 flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-white">Konfirmasi Lunas</h3>
                                <p className="text-xs text-gray-300 mt-0.5">Transaksi akan menjadi PAID</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/20 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                    <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100">
                        {[
                            { label: "Status", value: <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor}`}><span className={`w-1.5 h-1.5 rounded-full ${statusDot} animate-pulse`} />{statusLabel}</span> },
                            { label: "Invoice", value: <span className="text-xs font-mono font-semibold text-gray-700">{unit.reserved_invoice || "—"}</span> },
                            { label: "Dipesan oleh", value: <span className="text-xs font-semibold text-gray-800">{unit.reserved_by || "—"}</span> },
                            { label: "Laptop", value: <span className="text-xs font-semibold text-gray-800">{unit.laptop?.laptop_name || "—"}</span> },
                            { label: "Serial Number", value: <code className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded-md text-gray-800">{unit.serial_number || "—"}</code> },
                            { label: "Harga Jual", value: <span className="text-sm font-bold text-gray-800">Rp {(unit.selling_price || 0).toLocaleString("id-ID")}</span> },
                        ].map(row => (
                            <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                                <span className="text-xs text-gray-400">{row.label}</span>
                                {row.value}
                            </div>
                        ))}
                    </div>

                    {/* Upload bukti bayar */}
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Bukti Pembayaran <span className="text-gray-400 font-normal">(opsional)</span></label>
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleProofUpload} className="hidden" />
                        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingProof}
                            className={`w-full h-10 border-2 border-dashed rounded-xl text-xs font-medium transition flex items-center justify-center gap-2 ${paymentProof ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 hover:bg-gray-100"}`}>
                            {uploadingProof ? <><div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />Mengupload...</> : paymentProof ? "✅ Foto terupload — klik untuk ganti" : "📸 Upload foto bukti bayar"}
                        </button>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex gap-2">
                        <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                        <p className="text-xs text-amber-700">Konfirmasi akan mengubah status menjadi <strong>PAID</strong> dan unit menjadi <strong>SOLD</strong>. Tidak dapat dibatalkan.</p>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center gap-2">
                            <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" /></svg>
                            <p className="text-xs text-red-700">{error}</p>
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
                    <button onClick={handleConfirm} disabled={loading || uploadingProof}
                        className="flex-1 h-11 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-md">
                        {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Memproses...</> : <>✓ Konfirmasi Lunas</>}
                    </button>
                </div>
            </div>
        </div>
    );
}