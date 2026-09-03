"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getCurrentUserClient } from "@/lib/auth-client";
import {
    Trophy,
    ChevronLeft,
    ChevronRight,
    Medal,
    RefreshCw,
    Lock,
    Clock,
    Crown,
    UserCheck,
    Zap,
    Truck,
    Package,
    ShoppingCart,
    Wrench,
    Video,
    type LucideIcon,
} from "lucide-react";

/* ============================================================
   Konstanta & helper (logika sama persis dengan sebelumnya)
   ============================================================ */

const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"] as const;
function isAdminUser(user: any): boolean {
    const roles: string[] = Array.isArray(user?.roles) && user.roles.length > 0 ? user.roles : (user?.role ? [user.role] : []);
    return roles.some((r) => (FULL_ACCESS_ROLES as readonly string[]).includes(r));
}

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function initials(name: string): string {
    return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function formatPct(n: number): string {
    return n.toFixed(4);
}

function roleLabel(role: string): string {
    return (role || "").replace(/_/g, " ");
}

function tierBgFor(rank: number): string {
    return rank === 1 ? "bg-amber-50" : rank === 2 ? "bg-gray-50" : rank === 3 ? "bg-orange-50/60" : "";
}

/* Identitas warna per kategori lencana — dipakai untuk chip ikon &
   garis aksen di atas tiap kartu, supaya tiap kategori langsung
   kebedain tanpa harus baca judulnya. */
type Accent = { bar: string; chip: string };
const ACCENTS: Record<string, Accent> = {
    violet: { bar: "from-violet-400 to-purple-500", chip: "bg-violet-100 text-violet-600" },
    blue: { bar: "from-blue-400 to-indigo-500", chip: "bg-blue-100 text-blue-600" },
    orange: { bar: "from-orange-400 to-amber-500", chip: "bg-orange-100 text-orange-600" },
    teal: { bar: "from-teal-400 to-cyan-500", chip: "bg-teal-100 text-teal-600" },
    rose: { bar: "from-rose-400 to-pink-500", chip: "bg-rose-100 text-rose-600" },
    emerald: { bar: "from-emerald-400 to-green-500", chip: "bg-emerald-100 text-emerald-600" },
    cyan: { bar: "from-cyan-400 to-blue-500", chip: "bg-cyan-100 text-cyan-600" },
};

/* ============================================================
   Komponen UI kecil yang dipakai berulang
   ============================================================ */

function SectionHeader({
    icon: Icon,
    accent,
    title,
    description,
    children,
}: {
    icon: LucideIcon;
    accent: Accent;
    title: string;
    description: ReactNode;
    children?: ReactNode;
}) {
    return (
        <>
            <div className={`h-1.5 w-full bg-gradient-to-r ${accent.bar}`} />
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${accent.chip}`}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-base font-bold text-gray-800">{title}</p>
                        <p className="text-[11px] text-gray-500 mt-1 max-w-xl leading-relaxed">{description}</p>
                    </div>
                </div>
                {children && (
                    <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
                        {children}
                    </div>
                )}
            </div>
        </>
    );
}

function MonthNavigator({ month, year, onChange }: { month: number; year: number; onChange: (delta: number) => void }) {
    return (
        <div className="flex items-center gap-2">
            <button
                onClick={() => onChange(-1)}
                aria-label="Bulan sebelumnya"
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 transition-all shadow-sm"
            >
                <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-4 py-2 bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white rounded-xl font-bold text-xs min-w-[130px] text-center">
                {MONTH_NAMES[month]} {year}
            </div>
            <button
                onClick={() => onChange(1)}
                aria-label="Bulan berikutnya"
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 transition-all shadow-sm"
            >
                <ChevronRight className="w-4 h-4" />
            </button>
        </div>
    );
}

function OngoingMonthBanner() {
    return (
        <div className="px-4 sm:px-6 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
            <p className="text-[11px] font-semibold text-amber-700">Bulan ini masih berjalan — urutan &amp; level di bawah masih bisa berubah sampai akhir bulan.</p>
        </div>
    );
}

function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="p-4 sm:p-6 space-y-3">
            {Array(rows).fill(0).map((_, i) => (
                <div key={i} className="h-16 sm:h-14 bg-gray-50 rounded-2xl animate-pulse" />
            ))}
        </div>
    );
}

function EmptyState({ message, hint, action }: { message: string; hint?: string; action?: ReactNode }) {
    return (
        <div className="py-14 sm:py-16 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Trophy className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-sm text-gray-400 font-medium">{message}</p>
            {hint && <p className="text-xs text-gray-300 mt-1 mb-4">{hint}</p>}
            {action}
        </div>
    );
}

function KaryawanCell({ name, role }: { name: string; role: string }) {
    return (
        <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">
                {initials(name)}
            </div>
            <div className="min-w-0">
                <span className="font-bold text-gray-800 block truncate">{name}</span>
                <span className="text-[10px] text-gray-400">{roleLabel(role)}</span>
            </div>
        </div>
    );
}

function LevelBadge({ level, isPermanent }: { level: number; isPermanent: boolean }) {
    if (level <= 0) return <span className="text-gray-200 font-bold">—</span>;
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap shadow-sm ${isPermanent ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}>
            {isPermanent ? <Lock className="w-3 h-3" /> : <Clock className="w-3 h-3" />} Lvl {level}{isPermanent ? " · Permanen" : ""}
        </span>
    );
}

function QualityBadgeIcon({ rank }: { rank: number }) {
    const tier: "gold" | "silver" | "bronze" = rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze";
    const gradients: Record<typeof tier, string> = {
        gold: "linear-gradient(135deg, #fde047, #f59e0b, #b45309)",
        silver: "linear-gradient(135deg, #f8fafc, #94a3b8, #475569)",
        bronze: "linear-gradient(135deg, #fdba74, #c2410c, #7c2d12)",
    };
    return (
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-black shadow-sm flex-shrink-0" style={{ background: gradients[tier] }}>
            {rank}
        </span>
    );
}

function RankSlot({ rank }: { rank: number }) {
    return rank <= 3 ? (
        <QualityBadgeIcon rank={rank} />
    ) : (
        <span className="w-8 h-8 flex items-center justify-center text-sm font-bold text-gray-400 flex-shrink-0">{rank}</span>
    );
}

function MilestoneBadge({ milestone }: { milestone: number }) {
    if (milestone <= 0) return <span className="text-gray-200 font-bold">—</span>;
    return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap shadow-sm bg-orange-100 text-orange-700 border-orange-200">
            <Trophy className="w-3 h-3" /> {milestone}+
        </span>
    );
}

function ProgressBar({
    pct,
    gradient,
    valueLabel,
    valueColorClass,
    valueWidthClass = "",
    floor = 0,
}: {
    pct: number;
    gradient: string;
    valueLabel: string;
    valueColorClass: string;
    valueWidthClass?: string;
    floor?: number;
}) {
    const width = Math.max(Math.min(pct, 100), floor);
    return (
        <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[90px]">
                <div className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-700`} style={{ width: `${width}%` }} />
            </div>
            <span className={`text-sm font-black text-right flex-shrink-0 ${valueWidthClass} ${valueColorClass}`}>{valueLabel}</span>
        </div>
    );
}

/* ============================================================
   Podium — panggung Top 3, elemen "wow" utama halaman ini.
   Dipakai bareng oleh semua kategori lencana; hanya menerima
   data yang sudah diringkas jadi metricLabel + badge tambahan
   supaya tetap satu komponen untuk semua kategori.
   ============================================================ */

type PodiumEntry = {
    user_id: string;
    name: string;
    role: string;
    rank: number; // 1, 2, atau 3
    metricLabel: string;
    extra?: ReactNode;
};

const PODIUM_TIER = {
    1: {
        order: "order-2",
        lift: "-translate-y-2 sm:-translate-y-4",
        ring: "ring-2 ring-amber-300/70",
        cardBg: "bg-gradient-to-b from-amber-50 to-white",
        badgeGradient: "linear-gradient(135deg, #fde047, #f59e0b, #b45309)",
        metricClass: "bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent",
        avatarRing: "ring-4 ring-amber-200/70",
    },
    2: {
        order: "order-1",
        lift: "",
        ring: "ring-2 ring-slate-300/70",
        cardBg: "bg-gradient-to-b from-slate-50 to-white",
        badgeGradient: "linear-gradient(135deg, #f8fafc, #94a3b8, #475569)",
        metricClass: "bg-gradient-to-r from-slate-500 to-slate-700 bg-clip-text text-transparent",
        avatarRing: "ring-2 ring-slate-200/70",
    },
    3: {
        order: "order-3",
        lift: "",
        ring: "ring-2 ring-orange-300/70",
        cardBg: "bg-gradient-to-b from-orange-50 to-white",
        badgeGradient: "linear-gradient(135deg, #fdba74, #c2410c, #7c2d12)",
        metricClass: "bg-gradient-to-r from-orange-600 to-red-700 bg-clip-text text-transparent",
        avatarRing: "ring-2 ring-orange-200/70",
    },
} as const;

function PodiumSlot({ entry, tier }: { entry?: PodiumEntry; tier: 1 | 2 | 3 }) {
    const style = PODIUM_TIER[tier];
    if (!entry) return <div className={style.order} />;

    return (
        <div
            className={`${style.order} ${style.lift} podium-rise flex flex-col items-center text-center rounded-2xl border border-gray-100 ${style.cardBg} ${style.ring} p-3 sm:p-4 shadow-sm`}
            style={{ animationDelay: `${(tier - 1) * 90}ms` }}
        >
            {tier === 1 && <Crown className="w-5 h-5 text-amber-500 mb-1" />}
            <div
                className={`w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-white text-[10px] sm:text-xs font-black mb-2 ${style.avatarRing}`}
                style={{ background: "linear-gradient(135deg,#1a1a2e,#16213e)" }}
            >
                {initials(entry.name)}
            </div>
            <p className="text-[11px] sm:text-xs font-bold text-gray-800 truncate max-w-[92px] sm:max-w-[130px]">{entry.name}</p>
            <p className="text-[9px] sm:text-[10px] text-gray-400 mb-2 truncate max-w-[92px] sm:max-w-[130px]">{roleLabel(entry.role)}</p>
            <span
                className="inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full text-white text-[10px] sm:text-[11px] font-black shadow-sm mb-2"
                style={{ background: style.badgeGradient }}
            >
                {tier}
            </span>
            <p className={`text-base sm:text-lg font-black ${style.metricClass}`}>{entry.metricLabel}</p>
            {entry.extra && <div className="mt-2">{entry.extra}</div>}
        </div>
    );
}

function Podium({ entries }: { entries: PodiumEntry[] }) {
    const byRank = (r: number) => entries.find((e) => e.rank === r);
    return (
        <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4 sm:pb-5 bg-gray-50/40 border-b border-gray-100">
            <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end max-w-lg mx-auto">
                <PodiumSlot entry={byRank(2)} tier={2} />
                <PodiumSlot entry={byRank(1)} tier={1} />
                <PodiumSlot entry={byRank(3)} tier={3} />
            </div>
            <style jsx>{`
                @keyframes podiumRise {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .podium-rise { animation: podiumRise 0.5s ease-out both; }
            `}</style>
        </div>
    );
}

/* ============================================================
   Absensi Leaderboard
   ============================================================ */

type QualityRow = {
    user_id: string;
    name: string;
    role: string;
    perfect_days: number;
    manual_days: number;
    late_days: number;
    absent_days: number;
    total_workdays: number;
    quality_pct: number;
    avg_early_minutes: number;
    rank: number;
    level: number;
    isPermanent: boolean;
    isTemporary: boolean;
    streakMonths: number;
};

function AbsensiStatChip({ label, value, tone }: { label: string; value: ReactNode; tone: string }) {
    return (
        <div className="bg-gray-50 rounded-xl px-2 py-2 text-center">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">{label}</p>
            <p className={`text-sm font-black mt-0.5 ${tone}`}>{value}</p>
        </div>
    );
}

function AbsensiLeaderboard({ isAdmin }: { isAdmin: boolean }) {
    const router = useRouter();
    const today = new Date();
    const [calYear, setCalYear] = useState(today.getFullYear());
    const [calMonth, setCalMonth] = useState(today.getMonth());
    const [board, setBoard] = useState<QualityRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOngoingMonth, setIsOngoingMonth] = useState(false);

    const load = useCallback(async (y: number, m: number) => {
        setLoading(true);
        try {
            const r = await fetch(`/api/attendance/quality-rank?year=${y}&month=${m + 1}&list=true`);
            const d = await r.json();
            if (d.success) { setBoard(d.data || []); setIsOngoingMonth(!!d.isOngoingMonth); }
        } catch {
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(calYear, calMonth); }, [calYear, calMonth, load]);

    const changeMonth = (delta: number) => {
        let m = calMonth + delta;
        let y = calYear;
        if (m < 0) { m = 11; y -= 1; }
        if (m > 11) { m = 0; y += 1; }
        setCalMonth(m);
        setCalYear(y);
    };

    const podiumEntries: PodiumEntry[] = board
        .filter((u) => u.rank <= 3)
        .map((u) => ({
            user_id: u.user_id,
            name: u.name,
            role: u.role,
            rank: u.rank,
            metricLabel: `${formatPct(Number(u.quality_pct))}%`,
            extra: <LevelBadge level={u.level} isPermanent={u.isPermanent} />,
        }));

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <SectionHeader
                icon={UserCheck}
                accent={ACCENTS.violet}
                title="Lencana Kualitas Absensi"
                description={
                    <>
                        Hanya hari kerja yang <strong>tepat waktu</strong>, <strong>verifikasi wajah</strong> (bukan absen manual), dan <strong>tidak izin/tidak hadir</strong> yang dihitung sebagai hari sempurna. Juara Top 3 setiap bulan naik 1 level (bulan pertama Level 1, bulan kedua Level 2, dst — maksimal Level 10). Level 1-2 masih <strong>sementara</strong>: kalau bulan depan gak lanjut Top 3, levelnya reset. Begitu tembus <strong>Level 3</strong> (3 bulan Top 3 berturut-turut), lencananya jadi <strong>permanen</strong> dan gak akan hilang lagi walau performa turun setelahnya. Kalau ada yang sama di pelanggaran/hari sempurna/persentase, penentu akhirnya adalah <strong>rata-rata jarak waktu absen ke jam BUKA jadwal masing-masing</strong> — absen PAS jam buka = jarak 0 (terbaik), makin jauh ke arah manapun (kepagian ekstrem atau mepet telat), makin rendah rank-nya.
                    </>
                }
            >
                <MonthNavigator month={calMonth} year={calYear} onChange={changeMonth} />
            </SectionHeader>

            {!loading && board.length > 0 && <Podium entries={podiumEntries} />}
            {!loading && isOngoingMonth && board.length > 0 && <OngoingMonthBanner />}

            {loading ? (
                <LoadingSkeleton />
            ) : board.length === 0 ? (
                <EmptyState
                    message="Belum ada leaderboard untuk bulan ini"
                    hint="Leaderboard otomatis ter-generate saat Admin/Programmer/Asisten CEO membuka halaman Absensi bulan ini"
                    action={
                        isAdmin && (
                            <button
                                onClick={() => router.push(`/dashboard/attendance?year=${calYear}&month=${calMonth}`)}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 bg-violet-50 border border-violet-200 px-4 py-2 rounded-xl hover:bg-violet-100 transition-all"
                            >
                                <RefreshCw className="w-3.5 h-3.5" /> Buka Halaman Absensi Bulan Ini untuk Generate
                            </button>
                        )
                    }
                />
            ) : (
                <>
                    {/* Tabel — tampil di layar md ke atas (laptop/tablet lebar) */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/60">
                                    <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-14">Rank</th>
                                    <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                                    <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Level</th>
                                    <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Hari Kerja</th>
                                    <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Hari Sempurna</th>
                                    <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Manual</th>
                                    <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Terlambat</th>
                                    <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Izin/Tdk Hadir</th>
                                    <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Jarak ke Jadwal</th>
                                    <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[160px]">Skor Kualitas</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {board.map((u) => (
                                    <tr key={u.user_id} className={`hover:bg-gray-50/60 transition-colors duration-200 ${tierBgFor(u.rank)}`}>
                                        <td className="px-6 py-4"><RankSlot rank={u.rank} /></td>
                                        <td className="px-4 py-4"><KaryawanCell name={u.name} role={u.role} /></td>
                                        <td className="px-4 py-4 text-center"><LevelBadge level={u.level} isPermanent={u.isPermanent} /></td>
                                        <td className="px-4 py-4 text-center text-gray-600 font-semibold">{u.total_workdays}</td>
                                        <td className="px-4 py-4 text-center"><span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 text-sm font-black border border-emerald-200">{u.perfect_days}</span></td>
                                        <td className="px-4 py-4 text-center">{u.manual_days > 0 ? <span className="text-blue-600 font-bold">{u.manual_days}</span> : <span className="text-gray-200 font-bold">—</span>}</td>
                                        <td className="px-4 py-4 text-center">{u.late_days > 0 ? <span className="text-amber-600 font-bold">{u.late_days}</span> : <span className="text-gray-200 font-bold">—</span>}</td>
                                        <td className="px-4 py-4 text-center">{u.absent_days > 0 ? <span className="text-red-500 font-bold">{u.absent_days}</span> : <span className="text-gray-200 font-bold">—</span>}</td>
                                        <td className="px-4 py-4 text-center">
                                            {u.perfect_days > 0 ? (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 bg-violet-50 border border-violet-200 px-2 py-1 rounded-full whitespace-nowrap" title="Rata-rata jarak waktu absen ke jam BUKA jadwal efektifnya sendiri — makin dekat ke 0, makin disiplin">
                                                    <Clock className="w-3 h-3" /> {u.avg_early_minutes.toFixed(2)} mnt
                                                </span>
                                            ) : <span className="text-gray-200 font-bold">—</span>}
                                        </td>
                                        <td className="px-6 py-4">
                                            <ProgressBar
                                                pct={Number(u.quality_pct)}
                                                gradient="from-emerald-400 to-green-500"
                                                valueLabel={`${formatPct(Number(u.quality_pct))}%`}
                                                valueColorClass="text-emerald-600"
                                                valueWidthClass="w-20"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Kartu — tampil di layar kecil (hp) sebagai pengganti tabel */}
                    <div className="md:hidden divide-y divide-gray-50">
                        {board.map((u) => (
                            <div key={u.user_id} className={`p-4 space-y-3 ${tierBgFor(u.rank)}`}>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <RankSlot rank={u.rank} />
                                        <KaryawanCell name={u.name} role={u.role} />
                                    </div>
                                    <LevelBadge level={u.level} isPermanent={u.isPermanent} />
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <AbsensiStatChip label="Hari Kerja" value={u.total_workdays} tone="text-gray-700" />
                                    <AbsensiStatChip label="Sempurna" value={u.perfect_days} tone="text-emerald-600" />
                                    <AbsensiStatChip label="Manual" value={u.manual_days > 0 ? u.manual_days : "—"} tone="text-blue-600" />
                                    <AbsensiStatChip label="Terlambat" value={u.late_days > 0 ? u.late_days : "—"} tone="text-amber-600" />
                                    <AbsensiStatChip label="Izin/Absen" value={u.absent_days > 0 ? u.absent_days : "—"} tone="text-red-500" />
                                    <AbsensiStatChip label="Jarak Jadwal" value={u.perfect_days > 0 ? `${u.avg_early_minutes.toFixed(1)}m` : "—"} tone="text-violet-600" />
                                </div>
                                <ProgressBar
                                    pct={Number(u.quality_pct)}
                                    gradient="from-emerald-400 to-green-500"
                                    valueLabel={`${formatPct(Number(u.quality_pct))}%`}
                                    valueColorClass="text-emerald-600"
                                />
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

/* ============================================================
   Pekerjaan Leaderboard
   ============================================================ */

type KerjaRow = {
    user_id: string;
    name: string;
    role: string;
    score: number;
    metrics: { label: string; value: number; unit?: string }[];
    rank: number;
    level: number;
    isPermanent: boolean;
    isTemporary: boolean;
    streakMonths: number;
};

function KerjaLeaderboard({ isAdmin }: { isAdmin: boolean }) {
    const today = new Date();
    const [calYear, setCalYear] = useState(today.getFullYear());
    const [calMonth, setCalMonth] = useState(today.getMonth());
    const [board, setBoard] = useState<KerjaRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [isOngoingMonth, setIsOngoingMonth] = useState(false);

    const load = useCallback(async (y: number, m: number) => {
        setLoading(true);
        try {
            const r = await fetch(`/api/leaderboard-kerja/quality-rank?year=${y}&month=${m + 1}&list=true`);
            const d = await r.json();
            if (d.success) { setBoard(d.data || []); setIsOngoingMonth(!!d.isOngoingMonth); }
        } catch {
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(calYear, calMonth); }, [calYear, calMonth, load]);

    const changeMonth = (delta: number) => {
        let m = calMonth + delta;
        let y = calYear;
        if (m < 0) { m = 11; y -= 1; }
        if (m > 11) { m = 0; y += 1; }
        setCalMonth(m);
        setCalYear(y);
    };

    const generate = async () => {
        setGenerating(true);
        try {
            const r = await fetch("/api/leaderboard-kerja/quality-rank", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ year: calYear, month: calMonth + 1 }),
            });
            const d = await r.json();
            if (d.success) await load(calYear, calMonth);
        } catch {
        } finally {
            setGenerating(false);
        }
    };

    const maxScore = Math.max(...board.map((u) => u.score), 1);

    const podiumEntries: PodiumEntry[] = board
        .filter((u) => u.rank <= 3)
        .map((u) => ({
            user_id: u.user_id,
            name: u.name,
            role: u.role,
            rank: u.rank,
            metricLabel: u.score.toLocaleString(),
            extra: <LevelBadge level={u.level} isPermanent={u.isPermanent} />,
        }));

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <SectionHeader
                icon={Zap}
                accent={ACCENTS.blue}
                title="Lencana Kualitas Pekerjaan"
                description={
                    <>
                        Diambil dari <strong>Skor Pekerjaan</strong> bulanan (transaksi, preparation, service, konten, akutansi, dst — sesuai divisi masing-masing). Juara Top 3 setiap bulan naik 1 level (bulan pertama Level 1, bulan kedua Level 2, dst — maksimal Level 10). Level 1-2 masih <strong>sementara</strong>: kalau bulan depan gak lanjut Top 3, levelnya reset ke 0. Begitu tembus <strong>Level 3</strong> (3 bulan Top 3 berturut-turut), lencananya jadi <strong>permanen</strong> dan gak akan hilang lagi walau performa turun setelahnya.
                    </>
                }
            >
                <MonthNavigator month={calMonth} year={calYear} onChange={changeMonth} />
            </SectionHeader>

            {!loading && board.length > 0 && <Podium entries={podiumEntries} />}
            {!loading && isOngoingMonth && board.length > 0 && <OngoingMonthBanner />}

            {loading ? (
                <LoadingSkeleton />
            ) : board.length === 0 ? (
                <EmptyState
                    message="Belum ada leaderboard untuk bulan ini"
                    hint="Generate dulu snapshot skor Pekerjaan bulan ini"
                    action={
                        isAdmin && (
                            <button
                                onClick={generate}
                                disabled={generating}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 bg-violet-50 border border-violet-200 px-4 py-2 rounded-xl hover:bg-violet-100 transition-all disabled:opacity-50"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`} /> {generating ? "Menghitung..." : "Generate Leaderboard Bulan Ini"}
                            </button>
                        )
                    }
                />
            ) : (
                <>
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/60">
                                    <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-14">Rank</th>
                                    <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                                    <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Level</th>
                                    <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[160px]">Skor Pekerjaan</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {board.map((u) => (
                                    <tr key={u.user_id} className={`hover:bg-gray-50/60 transition-colors duration-200 ${tierBgFor(u.rank)}`}>
                                        <td className="px-6 py-4"><RankSlot rank={u.rank} /></td>
                                        <td className="px-4 py-4"><KaryawanCell name={u.name} role={u.role} /></td>
                                        <td className="px-4 py-4 text-center"><LevelBadge level={u.level} isPermanent={u.isPermanent} /></td>
                                        <td className="px-6 py-4">
                                            <ProgressBar
                                                pct={(u.score / maxScore) * 100}
                                                floor={4}
                                                gradient="from-blue-400 to-indigo-500"
                                                valueLabel={u.score.toLocaleString()}
                                                valueColorClass="text-indigo-600"
                                                valueWidthClass="w-16"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {isAdmin && (
                            <div className="px-6 py-3 border-t border-gray-50 flex justify-end">
                                <button onClick={generate} disabled={generating} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-400 hover:text-violet-600 transition-all disabled:opacity-50">
                                    <RefreshCw className={`w-3 h-3 ${generating ? "animate-spin" : ""}`} /> {generating ? "Menghitung..." : "Refresh Skor Bulan Ini"}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="md:hidden divide-y divide-gray-50">
                        {board.map((u) => (
                            <div key={u.user_id} className={`p-4 space-y-3 ${tierBgFor(u.rank)}`}>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <RankSlot rank={u.rank} />
                                        <KaryawanCell name={u.name} role={u.role} />
                                    </div>
                                    <LevelBadge level={u.level} isPermanent={u.isPermanent} />
                                </div>
                                <ProgressBar
                                    pct={(u.score / maxScore) * 100}
                                    floor={4}
                                    gradient="from-blue-400 to-indigo-500"
                                    valueLabel={`Skor: ${u.score.toLocaleString()}`}
                                    valueColorClass="text-indigo-600"
                                />
                            </div>
                        ))}
                        {isAdmin && (
                            <div className="px-4 py-3 flex justify-center">
                                <button onClick={generate} disabled={generating} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-400 hover:text-violet-600 transition-all disabled:opacity-50">
                                    <RefreshCw className={`w-3 h-3 ${generating ? "animate-spin" : ""}`} /> {generating ? "Menghitung..." : "Refresh Skor Bulan Ini"}
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

/* ============================================================
   Board berbasis "milestone" — dipakai bareng oleh Pengantaran,
   Penyedia Barang, Sales, Teknisi, dan Konten Kreator karena
   struktur tabel & kartunya identik, cuma beda judul/warna/data.
   ============================================================ */

type MilestoneRow = {
    user_id: string;
    name: string;
    role: string;
    total: number;
    milestone: number;
    rank: number;
};

function MilestoneBoardView({
    icon,
    accent,
    title,
    description,
    headerRight,
    board,
    loading,
    emptyMessage,
    alwaysShowMilestone,
    totalLabel,
    rowGradient,
    valueColorClass,
}: {
    icon: LucideIcon;
    accent: Accent;
    title: string;
    description: ReactNode;
    headerRight?: ReactNode;
    board: MilestoneRow[];
    loading: boolean;
    emptyMessage: string;
    alwaysShowMilestone: boolean;
    totalLabel: string;
    rowGradient: string;
    valueColorClass: string;
}) {
    const maxTotal = Math.max(...board.map((u) => u.total), 1);

    const podiumEntries: PodiumEntry[] = board
        .filter((u) => u.rank <= 3)
        .map((u) => ({
            user_id: u.user_id,
            name: u.name,
            role: u.role,
            rank: u.rank,
            metricLabel: u.total.toLocaleString(),
            extra: <MilestoneBadge milestone={u.milestone} />,
        }));

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <SectionHeader icon={icon} accent={accent} title={title} description={description}>
                {headerRight}
            </SectionHeader>

            {!loading && board.length > 0 && <Podium entries={podiumEntries} />}

            {loading ? (
                <LoadingSkeleton />
            ) : board.length === 0 ? (
                <EmptyState message={emptyMessage} />
            ) : (
                <>
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/60">
                                    <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-14">Rank</th>
                                    <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                                    <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Lencana</th>
                                    <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[160px]">{totalLabel}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {board.map((u) => {
                                    const isTop3 = u.rank <= 3;
                                    return (
                                        <tr key={u.user_id} className={`hover:bg-gray-50/60 transition-colors duration-200 ${tierBgFor(u.rank)}`}>
                                            <td className="px-6 py-4"><RankSlot rank={u.rank} /></td>
                                            <td className="px-4 py-4"><KaryawanCell name={u.name} role={u.role} /></td>
                                            <td className="px-4 py-4 text-center">
                                                {(alwaysShowMilestone || isTop3) ? <MilestoneBadge milestone={u.milestone} /> : <span className="text-gray-200 font-bold">—</span>}
                                            </td>
                                            <td className="px-6 py-4">
                                                <ProgressBar
                                                    pct={(u.total / maxTotal) * 100}
                                                    floor={4}
                                                    gradient={rowGradient}
                                                    valueLabel={u.total.toLocaleString()}
                                                    valueColorClass={valueColorClass}
                                                    valueWidthClass="w-16"
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="md:hidden divide-y divide-gray-50">
                        {board.map((u) => {
                            const isTop3 = u.rank <= 3;
                            return (
                                <div key={u.user_id} className={`p-4 space-y-3 ${tierBgFor(u.rank)}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <RankSlot rank={u.rank} />
                                            <KaryawanCell name={u.name} role={u.role} />
                                        </div>
                                        {(alwaysShowMilestone || isTop3) && <MilestoneBadge milestone={u.milestone} />}
                                    </div>
                                    <ProgressBar
                                        pct={(u.total / maxTotal) * 100}
                                        floor={4}
                                        gradient={rowGradient}
                                        valueLabel={`${totalLabel}: ${u.total.toLocaleString()}`}
                                        valueColorClass={valueColorClass}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

/* ---------- Pengantaran ---------- */

const DELIVERY_MONTH_OPTIONS = [1, 2, 3, 6, 12];

function PengantaranLeaderboard() {
    const [months, setMonths] = useState(1);
    const [board, setBoard] = useState<MilestoneRow[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async (m: number) => {
        setLoading(true);
        try {
            const r = await fetch(`/api/preparation/delivery-milestones?months=${m}&list=true`);
            const d = await r.json();
            if (d.success) setBoard(d.data || []);
        } catch {
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(months); }, [months, load]);

    return (
        <MilestoneBoardView
            icon={Truck}
            accent={ACCENTS.orange}
            title="Lencana Pengantaran"
            description={
                <>
                    Dihitung dari <strong>total pengantaran berhasil</strong> (status Selesai, metode Pengantaran) dalam periode yang dipilih. Lencana didapat berdasarkan MILESTONE total yang sudah dicapai: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, sampai 1000 pengantaran — bukan level bulanan seperti Absensi/Pekerjaan. Hanya <strong>Top 3</strong> (paling banyak mengantar) di periode ini yang lencananya tampil.
                </>
            }
            headerRight={
                <div className="flex items-center gap-1.5 flex-wrap">
                    {DELIVERY_MONTH_OPTIONS.map((m) => (
                        <button
                            key={m}
                            onClick={() => setMonths(m)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${months === m ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md" : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                        >
                            {m} Bulan
                        </button>
                    ))}
                </div>
            }
            board={board}
            loading={loading}
            emptyMessage="Belum ada pengantaran di periode ini"
            alwaysShowMilestone={false}
            totalLabel="Total Diantar"
            rowGradient="from-orange-400 to-amber-500"
            valueColorClass="text-orange-600"
        />
    );
}

/* ---------- Penyedia Barang ---------- */

function PenyediaBarangLeaderboard() {
    const [board, setBoard] = useState<MilestoneRow[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`/api/preparation/provider-milestones?list=true`);
            const d = await r.json();
            if (d.success) setBoard(d.data || []);
        } catch {
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    return (
        <MilestoneBoardView
            icon={Package}
            accent={ACCENTS.teal}
            title="Lencana Penyedia Barang"
            description={
                <>
                    Dihitung dari <strong>total unit laptop</strong> yang berhasil disiapkan (tidak termasuk item yang dibatalkan) sepanjang waktu bekerja. Lencana didapat berdasarkan MILESTONE total unit yang sudah dicapai: 100, 300, 500, 700, 1000, 1500, 2000, sampai 3000 unit — bersifat kumulatif &amp; permanen begitu tercapai, ditampilkan untuk semua yang sudah meraihnya (tidak dibatasi Top 3).
                </>
            }
            board={board}
            loading={loading}
            emptyMessage="Belum ada data Penyedia Barang"
            alwaysShowMilestone={true}
            totalLabel="Total Unit Disiapkan"
            rowGradient="from-teal-400 to-cyan-500"
            valueColorClass="text-teal-600"
        />
    );
}

/* ---------- Sales ---------- */

function SalesLeaderboard() {
    const [board, setBoard] = useState<MilestoneRow[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`/api/transaction/sales-milestones?list=true`);
            const d = await r.json();
            if (d.success) setBoard(d.data || []);
        } catch {
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    return (
        <MilestoneBoardView
            icon={ShoppingCart}
            accent={ACCENTS.rose}
            title="Lencana Sales"
            description={
                <>
                    Dihitung dari <strong>total transaksi Lunas</strong> yang berhasil diselesaikan sepanjang waktu bekerja. Lencana didapat berdasarkan MILESTONE total transaksi yang sudah dicapai: 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, sampai 20000 transaksi — bersifat kumulatif &amp; permanen begitu tercapai, ditampilkan untuk semua yang sudah meraihnya (tidak dibatasi Top 3).
                </>
            }
            board={board}
            loading={loading}
            emptyMessage="Belum ada data Sales"
            alwaysShowMilestone={true}
            totalLabel="Total Transaksi"
            rowGradient="from-rose-400 to-pink-500"
            valueColorClass="text-rose-600"
        />
    );
}

/* ---------- Teknisi ---------- */

function TeknisiLeaderboard() {
    const [board, setBoard] = useState<MilestoneRow[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`/api/service/teknisi-milestones?list=true`);
            const d = await r.json();
            if (d.success) setBoard(d.data || []);
        } catch {
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    return (
        <MilestoneBoardView
            icon={Wrench}
            accent={ACCENTS.emerald}
            title="Lencana Teknisi"
            description={
                <>
                    Dihitung dari <strong>total unit laptop servis</strong> yang berhasil diselesaikan (status Done/Sudah Diambil, tidak termasuk yang Gagal Diperbaiki/Tidak Jadi) sepanjang waktu bekerja. Lencana didapat berdasarkan MILESTONE total servis yang sudah dicapai: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, sampai 1000 unit — bersifat kumulatif &amp; permanen begitu tercapai, ditampilkan untuk semua yang sudah meraihnya (tidak dibatasi Top 3).
                </>
            }
            board={board}
            loading={loading}
            emptyMessage="Belum ada data Teknisi"
            alwaysShowMilestone={true}
            totalLabel="Total Servis"
            rowGradient="from-emerald-400 to-green-500"
            valueColorClass="text-emerald-600"
        />
    );
}

/* ---------- Konten Kreator ---------- */

function KontenKreatorLeaderboard() {
    const [board, setBoard] = useState<MilestoneRow[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`/api/cc-reports/konten-milestones?list=true`);
            const d = await r.json();
            if (d.success) setBoard(d.data || []);
        } catch {
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    return (
        <MilestoneBoardView
            icon={Video}
            accent={ACCENTS.cyan}
            title="Lencana Konten Kreator"
            description={
                <>
                    Dihitung dari <strong>total tahap Take + Edit</strong> video yang berhasil diselesaikan (konten yang di-Batal tidak termasuk) sepanjang waktu bekerja — kalau 1 orang mengerjakan Take dan Edit di video yang sama, dihitung 2. Lencana didapat berdasarkan MILESTONE total yang sudah dicapai: 100, 200, 300, 400, 500, 600, 700, 800, 900, sampai 1000 — bersifat kumulatif &amp; permanen begitu tercapai, ditampilkan untuk semua yang sudah meraihnya (tidak dibatasi Top 3).
                </>
            }
            board={board}
            loading={loading}
            emptyMessage="Belum ada data Konten Kreator"
            alwaysShowMilestone={true}
            totalLabel="Total Video"
            rowGradient="from-cyan-400 to-blue-500"
            valueColorClass="text-cyan-600"
        />
    );
}

/* ============================================================
   Halaman utama
   ============================================================ */

type SubTab = "absensi" | "kerja" | "pengantaran" | "penyedia" | "sales" | "teknisi" | "konten";

const TABS: { id: SubTab; label: string; icon: LucideIcon }[] = [
    { id: "absensi", label: "Absensi", icon: UserCheck },
    { id: "kerja", label: "Pekerjaan", icon: Zap },
    { id: "pengantaran", label: "Pengantaran", icon: Truck },
    { id: "penyedia", label: "Penyedia Barang", icon: Package },
    { id: "sales", label: "Sales", icon: ShoppingCart },
    { id: "teknisi", label: "Teknisi", icon: Wrench },
    { id: "konten", label: "Konten Kreator", icon: Video },
];

export default function LencanaPage() {
    const [subTab, setSubTab] = useState<SubTab>("absensi");
    const [currentUser, setCurrentUser] = useState<any>(null);

    useEffect(() => {
        getCurrentUserClient().then((u) => setCurrentUser(u));
    }, []);

    return (
        <DashboardLayout>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5 sm:space-y-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md flex-shrink-0">
                        <Medal className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">Lencana</h1>
                        <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">Penghargaan bulanan untuk performa terbaik — juara 1-3 tampil di halaman profil</p>
                    </div>
                </div>

                {/* Sub-navigasi lencana — tambah entry baru di TABS kalau ada kategori
                    lencana lain di masa depan. Scroll horizontal di layar sempit
                    supaya tab tidak numpuk/terpotong di hp. */}
                <div
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5 flex gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
                    style={{ scrollbarWidth: "none" }}
                >
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setSubTab(tab.id)}
                                className={`inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl text-xs font-bold transition-all duration-200 flex-shrink-0 whitespace-nowrap ${subTab === tab.id ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}
                            >
                                <Icon className="w-3.5 h-3.5" /> {tab.label}
                            </button>
                        );
                    })}
                </div>

                {subTab === "absensi" && <AbsensiLeaderboard isAdmin={isAdminUser(currentUser)} />}
                {subTab === "kerja" && <KerjaLeaderboard isAdmin={isAdminUser(currentUser)} />}
                {subTab === "pengantaran" && <PengantaranLeaderboard />}
                {subTab === "penyedia" && <PenyediaBarangLeaderboard />}
                {subTab === "sales" && <SalesLeaderboard />}
                {subTab === "teknisi" && <TeknisiLeaderboard />}
                {subTab === "konten" && <KontenKreatorLeaderboard />}
            </div>
        </DashboardLayout>
    );
}