"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
    ArrowLeft, Trophy, Medal, Award, Users, Clock, Wallet, TrendingUp,
    Inbox, CalendarDays, type LucideIcon,
} from "lucide-react";

const OvertimeCharts = dynamic(() => import("./OvertimeCharts"), {
    ssr: false,
    loading: () => <div className="h-[420px] rounded-2xl bg-gray-100 animate-pulse" />,
});

// ─── TYPES ──────────────────────────────────────────────────────────────
type Scope = "day" | "month" | "all";

type RankingEntry = {
    user_id: string; name: string; role: string;
    sessions: number; totalMinutes: number; totalHours: number;
    totalPay: number | null; avgMinutes: number;
};
type StatusCount = { status: string; count: number };
type TrendPoint = { key: string; hours: number };
type LeaderboardData = {
    summary: {
        totalSessions: number; totalMinutes: number; totalPay: number | null;
        activeEmployees: number; avgMinutesPerSession: number;
        topPerformer: { name: string; totalMinutes: number } | null;
    };
    ranking: RankingEntry[];
    statusDistribution: StatusCount[];
    trend: TrendPoint[];
    canSeePay: boolean;
    scope: Scope;
    date: string;
};

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const STATUS_COLORS: Record<string, string> = {
    PENDING: "#f59e0b", APPROVED: "#8b5cf6", ONGOING: "#10b981",
    COMPLETED: "#3b82f6", NEED_PROOF: "#f97316", REJECTED: "#ef4444", CANCELLED: "#9ca3af",
};
const STATUS_LABELS: Record<string, string> = {
    PENDING: "Pending", APPROVED: "Disetujui", ONGOING: "Berjalan",
    COMPLETED: "Selesai", NEED_PROOF: "Upload Foto", REJECTED: "Ditolak", CANCELLED: "Dibatalkan",
};

function formatRupiah(n: number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function formatDurationMinutes(mins: number) {
    if (!mins) return "0 jam";
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    return m > 0 ? `${h}j ${m}m` : `${h} jam`;
}
function initials(name: string) { return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase(); }
const AV_COLORS = [
    "bg-violet-100 text-violet-700", "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700", "bg-rose-100 text-rose-700",
    "bg-amber-100 text-amber-700", "bg-cyan-100 text-cyan-700", "bg-purple-100 text-purple-700",
];
function avBg(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff; return AV_COLORS[Math.abs(h) % AV_COLORS.length]; }

// Tanggal hari ini di WIB (UTC+7), format YYYY-MM-DD
function todayWIB(): string {
    const w = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return w.toISOString().slice(0, 10);
}
// Geser tanggal (string YYYY-MM-DD) sejumlah hari, tanpa kena masalah timezone
function addDaysToDateStr(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

// ─── PODIUM CARD ───────────────────────────────────────────────────────
// Offset tinggi sekarang aktif dari mobile juga (sebelumnya cuma sm: ke atas),
// jadi efek "podium" (emas lebih tinggi) tetap kerasa di layar kecil.
const PODIUM_STYLE: Record<number, { badge: string; ring: string; icon: LucideIcon; iconColor: string; height: string; order: string }> = {
    0: { badge: "bg-gradient-to-br from-amber-300 to-amber-500", ring: "ring-amber-300", icon: Trophy, iconColor: "text-amber-500", height: "mt-0", order: "order-2" },
    1: { badge: "bg-gradient-to-br from-gray-300 to-gray-400", ring: "ring-gray-300", icon: Medal, iconColor: "text-gray-400", height: "mt-4 sm:mt-6", order: "order-1" },
    2: { badge: "bg-gradient-to-br from-orange-300 to-orange-500", ring: "ring-orange-300", icon: Award, iconColor: "text-orange-400", height: "mt-6 sm:mt-9", order: "order-3" },
};

function PodiumCard({ entry, rank, canSeePay }: { entry: RankingEntry; rank: number; canSeePay: boolean }) {
    const style = PODIUM_STYLE[rank];
    const Icon = style.icon;
    const bg = avBg(entry.name);
    return (
        <div className={`flex-1 min-w-0 ${style.order} ${style.height}`}>
            {/* padding dirapatkan di mobile (p-3) supaya 3 kartu berdampingan tidak sesak,
                tetap lega di desktop (sm:p-5) */}
            <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-5 text-center ring-2 ${style.ring} relative`}>
                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full ${style.badge} flex items-center justify-center text-white text-[10px] font-black shadow-sm`}>
                    {rank + 1}
                </div>
                <Icon className={`w-5 h-5 mx-auto mt-2 mb-1.5 ${style.iconColor}`} />
                <div className={`w-12 h-12 mx-auto rounded-xl flex items-center justify-center text-sm font-bold mb-2 ${bg}`}>{initials(entry.name)}</div>
                <p className="font-bold text-gray-900 text-xs leading-tight truncate">{entry.name}</p>
                <p className="text-[9px] text-gray-400 mt-0.5 mb-2 truncate">{entry.role.replace(/_/g, " ")}</p>
                <p className="text-lg font-black text-violet-600 leading-none">{formatDurationMinutes(entry.totalMinutes)}</p>
                <p className="text-[9px] text-gray-400 mt-1">{entry.sessions} sesi lembur</p>
                {canSeePay && entry.totalPay != null && (
                    <p className="text-[10px] font-semibold text-emerald-600 mt-1.5 font-mono">{formatRupiah(entry.totalPay)}</p>
                )}
            </div>
        </div>
    );
}

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
    { value: "day", label: "Harian" },
    { value: "month", label: "Bulanan" },
    { value: "all", label: "Semua Waktu" },
];

export default function OvertimeLeaderboardPage() {
    const router = useRouter();
    const [scope, setScope] = useState<Scope>("month");
    const [period, setPeriod] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
    const [selectedDate, setSelectedDate] = useState(() => todayWIB());
    const [data, setData] = useState<LeaderboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Recharts merender SVG — properti seperti fontSize/width axis adalah prop JS,
    // bukan CSS, sehingga tidak otomatis mengikuti breakpoint Tailwind. Perlu deteksi
    // manual. Nilai awal selalu false (baik di server maupun render pertama di client)
    // agar tidak terjadi hydration mismatch; nilai sebenarnya di-set setelah mount.
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 640);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true); setError("");
        try {
            const params = new URLSearchParams({ scope });
            if (scope === "month") { params.set("year", String(period.year)); params.set("month", String(period.month + 1)); }
            if (scope === "day") { params.set("date", selectedDate); }
            const res = await fetch(`/api/attendance/overtime/leaderboard?${params.toString()}`);
            const d = await res.json();
            if (!d.success) { setError(d.message || "Gagal memuat leaderboard"); return; }
            setData(d.data);
        } catch { setError("Gagal memuat leaderboard"); } finally { setLoading(false); }
    }, [scope, period, selectedDate]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // top3 dengan rank aslinya (0/1/2) supaya PodiumCard tidak perlu findIndex/non-null assertion
    const top3 = (data?.ranking.slice(0, 3) ?? []).map((entry, rank) => ({ entry, rank }));
    const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3; // urutan visual: 2-1-3

    const barData = useMemo(
        () => (data?.ranking.slice(0, 10) ?? []).map(r => ({
            name: r.name.split(" ")[0], fullName: r.name,
            totalHours: r.totalHours, totalMinutes: r.totalMinutes, sessions: r.sessions,
        })),
        [data]
    );

    const pieData = useMemo(
        () => (data?.statusDistribution ?? []).map(s => ({ name: STATUS_LABELS[s.status] ?? s.status, value: s.count, color: STATUS_COLORS[s.status] ?? "#9ca3af" })),
        [data]
    );

    const headerSubtitle = loading
        ? "Memuat data..."
        : scope === "all"
            ? "Semua waktu"
            : scope === "day"
                ? new Date(selectedDate + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                : `${MONTH_NAMES[period.month]} ${period.year}`;

    const trendLabel = scope === "day" ? "per Jam" : scope === "month" ? "per Hari" : "per Bulan";
    const trendTickFormatter = (v: string) => scope === "day" ? v : scope === "month" ? v.slice(-2) : v.slice(2);

    return (
        <DashboardLayout>
            <div className="min-h-screen bg-[#F7F7F8]">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5">

                    {/* ── Header ── */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <button onClick={() => router.push("/dashboard/attendance/overtime")}
                                className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-all flex-shrink-0 active:scale-95 bg-white">
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                            <div>
                                <div className="flex items-center gap-2.5 mb-1">
                                    <div className="w-1 h-6 rounded-full bg-violet-600 flex-shrink-0" />
                                    <h1 className="text-lg sm:text-xl lg:text-2xl font-black text-gray-900 tracking-tight">Leaderboard Lembur</h1>
                                </div>
                                <p className="text-xs text-gray-400 pl-4">{headerSubtitle}</p>
                            </div>
                        </div>

                        {/* ── Filter Periode ── */}
                        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide flex-nowrap sm:flex-wrap -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-shrink-0">
                            <div className="flex gap-1 p-1 bg-white rounded-xl border border-gray-100 shadow-sm">
                                {SCOPE_OPTIONS.map(opt => (
                                    <button key={opt.value} onClick={() => setScope(opt.value)}
                                        className={`h-8 px-3 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${scope === opt.value ? "bg-[#0f0c29] text-white shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>

                            {scope === "day" && (
                                <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 shadow-sm px-1">
                                    <button onClick={() => setSelectedDate(d => addDaysToDateStr(d, -1))}
                                        className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all font-bold text-base">‹</button>
                                    <span className="text-[10px] font-semibold text-gray-600 px-1.5 whitespace-nowrap">
                                        {new Date(selectedDate + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                                    </span>
                                    <button onClick={() => setSelectedDate(d => addDaysToDateStr(d, 1))}
                                        className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all font-bold text-base">›</button>
                                    <button onClick={() => setSelectedDate(todayWIB())}
                                        className="h-8 px-2.5 rounded-lg hover:bg-gray-100 text-[10px] font-semibold text-gray-500 hover:text-gray-800 transition-all whitespace-nowrap">Hari ini</button>
                                </div>
                            )}

                            {scope === "month" && (
                                <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 shadow-sm px-1">
                                    <button onClick={() => setPeriod(p => ({ month: p.month === 0 ? 11 : p.month - 1, year: p.month === 0 ? p.year - 1 : p.year }))}
                                        className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all font-bold text-base">‹</button>
                                    <span className="text-[10px] font-semibold text-gray-600 px-1.5 whitespace-nowrap">{MONTH_NAMES[period.month].substring(0, 3)} {period.year}</span>
                                    <button onClick={() => setPeriod(p => ({ month: p.month === 11 ? 0 : p.month + 1, year: p.month === 11 ? p.year + 1 : p.year }))}
                                        className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all font-bold text-base">›</button>
                                </div>
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-3 rounded-xl">{error}</div>
                    )}

                    {/* ── Summary Cards ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: "Total Jam Lembur", value: loading ? null : formatDurationMinutes(data?.summary.totalMinutes ?? 0), icon: <Clock className="w-5 h-5 text-violet-500" />, accent: "from-violet-50 to-violet-100/30" },
                            { label: "Total Sesi", value: loading ? null : `${data?.summary.totalSessions ?? 0}`, icon: <TrendingUp className="w-5 h-5 text-blue-500" />, accent: "from-blue-50 to-blue-100/30" },
                            { label: "Karyawan Aktif", value: loading ? null : `${data?.summary.activeEmployees ?? 0}`, icon: <Users className="w-5 h-5 text-emerald-500" />, accent: "from-emerald-50 to-emerald-100/30" },
                            data?.canSeePay
                                ? { label: "Total Bayaran", value: loading ? null : formatRupiah(data?.summary.totalPay ?? 0), icon: <Wallet className="w-5 h-5 text-amber-500" />, accent: "from-amber-50 to-amber-100/30" }
                                : { label: "Rata² per Sesi", value: loading ? null : formatDurationMinutes(data?.summary.avgMinutesPerSession ?? 0), icon: <CalendarDays className="w-5 h-5 text-amber-500" />, accent: "from-amber-50 to-amber-100/30" },
                        ].map(c => (
                            <div key={c.label} className={`bg-gradient-to-br ${c.accent} rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3`}>
                                <div className="w-9 h-9 rounded-xl bg-white/80 border border-white shadow-sm flex items-center justify-center flex-shrink-0">{c.icon}</div>
                                <div className="min-w-0">
                                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest leading-none mb-1.5">{c.label}</p>
                                    <p className="text-sm sm:text-base font-black leading-none text-gray-800 truncate">
                                        {c.value === null ? <span className="inline-block w-14 h-4 bg-white/60 rounded-lg animate-pulse" /> : c.value}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ── Podium ── */}
                    {!loading && top3.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-4">Top Performer</p>
                            <div className="flex items-end gap-1.5 sm:gap-3">
                                {podiumOrder.map(({ entry, rank }) => (
                                    <PodiumCard key={entry.user_id} entry={entry} rank={rank} canSeePay={data?.canSeePay ?? false} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Charts ── */}
                    {!loading && data && data.ranking.length > 0 && (
                        <OvertimeCharts
                            barData={barData}
                            pieData={pieData}
                            trend={data.trend}
                            trendLabel={trendLabel}
                            trendTickFormatter={trendTickFormatter}
                            isMobile={isMobile}
                        />
                    )}

                    {/* ── Full Ranking Table ── */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                       <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-gray-100">
                            <p className="font-bold text-gray-900 text-sm">Papan Peringkat Lengkap</p>
                        </div>
                        {loading ? (
                            <div className="divide-y divide-gray-50">
                                {Array(5).fill(0).map((_, i) => (
                                    <div key={i} className="px-5 py-4 flex items-center gap-3.5">
                                        <div className="w-6 h-4 bg-gray-100 rounded animate-pulse" />
                                        <div className="w-10 h-10 rounded-xl bg-gray-100 animate-pulse flex-shrink-0" />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-3 bg-gray-100 rounded-lg animate-pulse w-36" />
                                            <div className="h-2.5 bg-gray-100 rounded-lg animate-pulse w-24" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : !data || data.ranking.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-2">
                                <Inbox size={30} className="text-gray-300" />
                                <p className="text-xs text-gray-400 font-medium">Belum ada data lembur pada periode ini</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {data.ranking.map((r, idx) => {
                                    const bg = avBg(r.name);
                                    return (
                                       <div key={r.user_id} className="px-4 sm:px-5 py-3 sm:py-3.5 flex items-center gap-2.5 sm:gap-3.5">
                                            <span className={`w-6 text-center text-xs font-black flex-shrink-0 ${idx < 3 ? "text-violet-600" : "text-gray-300"}`}>{idx + 1}</span>
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${bg}`}>{initials(r.name)}</div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-gray-900 text-xs leading-tight truncate">{r.name}</p>
                                                <p className="text-[9px] text-gray-400 mt-0.5">{r.role.replace(/_/g, " ")} · {r.sessions} sesi</p>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <p className="text-xs font-bold text-gray-800 font-mono">{formatDurationMinutes(r.totalMinutes)}</p>
                                                {data.canSeePay && r.totalPay != null && (
                                                    <p className="text-[9px] text-emerald-600 font-semibold mt-0.5">{formatRupiah(r.totalPay)}</p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </DashboardLayout>
    );
}