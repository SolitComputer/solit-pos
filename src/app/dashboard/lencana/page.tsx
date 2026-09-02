"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getCurrentUserClient } from "@/lib/auth-client";
import { Trophy, ChevronLeft, ChevronRight, Medal, RefreshCw, Lock, Clock } from "lucide-react";

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
    avg_early_minutes: number; // ✅ NEW
    rank: number;
    level: number;
    isPermanent: boolean;
    isTemporary: boolean;
    streakMonths: number;
};

function LevelBadge({ level, isPermanent }: { level: number; isPermanent: boolean }) {
    if (level <= 0) return <span className="text-gray-200 font-bold">—</span>;
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${isPermanent ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}>
            {isPermanent ? <Lock className="w-3 h-3" /> : <Clock className="w-3 h-3" />} Lvl {level}{isPermanent ? " · Permanen" : ""}
        </span>
    );
}


type SubTab = "absensi" | "kerja" | "pengantaran" | "penyedia" | "sales";

function QualityBadgeIcon({ rank }: { rank: number }) {
    const tier: "gold" | "silver" | "bronze" = rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze";
    const gradients: Record<typeof tier, string> = {
        gold: "linear-gradient(135deg, #fde047, #f59e0b, #b45309)",
        silver: "linear-gradient(135deg, #f8fafc, #94a3b8, #475569)",
        bronze: "linear-gradient(135deg, #fdba74, #c2410c, #7c2d12)",
    };
    return (
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-black shadow-sm" style={{ background: gradients[tier] }}>
            {rank}
        </span>
    );
}

function AbsensiLeaderboard({ isAdmin }: { isAdmin: boolean }) {
    const router = useRouter();
    const today = new Date();
    const [calYear, setCalYear] = useState(today.getFullYear());
    const [calMonth, setCalMonth] = useState(today.getMonth());
    const [board, setBoard] = useState<QualityRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOngoingMonth, setIsOngoingMonth] = useState(false); // ✅ NEW

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

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-purple-50 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <p className="text-base font-bold text-gray-800">Lencana Kualitas Absensi</p>
                    <p className="text-[11px] text-gray-500 mt-1 max-w-xl">
                        Hanya hari kerja yang <strong>tepat waktu</strong>, <strong>verifikasi wajah</strong> (bukan absen manual), dan <strong>tidak izin/tidak hadir</strong> yang dihitung sebagai hari sempurna. Juara Top 3 setiap bulan naik 1 level (bulan pertama Level 1, bulan kedua Level 2, dst — maksimal Level 10). Level 1-2 masih <strong>sementara</strong>: kalau bulan depan gak lanjut Top 3, levelnya reset. Begitu tembus <strong>Level 3</strong> (3 bulan Top 3 berturut-turut), lencananya jadi <strong>permanen</strong> dan gak akan hilang lagi walau performa turun setelahnya. Kalau ada yang sama di pelanggaran/hari sempurna/persentase, penentu akhirnya adalah <strong>rata-rata jarak waktu absen ke jam BUKA jadwal masing-masing</strong> — absen PAS jam buka = jarak 0 (terbaik), makin jauh ke arah manapun (kepagian ekstrem atau mepet telat), makin rendah rank-nya.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => changeMonth(-1)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 transition-all shadow-sm">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="px-4 py-2 bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white rounded-xl font-bold text-xs min-w-[130px] text-center">
                        {MONTH_NAMES[calMonth]} {calYear}
                    </div>
                    <button onClick={() => changeMonth(1)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 transition-all shadow-sm">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {!loading && isOngoingMonth && board.length > 0 && (
                <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <p className="text-[11px] font-semibold text-amber-700">Bulan ini masih berjalan — urutan &amp; level di bawah masih bisa berubah sampai akhir bulan.</p>
                </div>
            )}

            {loading ? (
                <div className="p-6 space-y-3">{Array(5).fill(0).map((_, i) => <div key={i} className="h-14 bg-gray-50 rounded-2xl animate-pulse" />)}</div>
            ) : board.length === 0 ? (
                <div className="py-16 text-center px-6">
                    <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                        <Trophy className="w-7 h-7 text-gray-300" />
                    </div>
                    <p className="text-sm text-gray-400 font-medium">Belum ada leaderboard untuk bulan ini</p>
                    <p className="text-xs text-gray-300 mt-1 mb-4">Leaderboard otomatis ter-generate saat Admin/Programmer/Asisten CEO membuka halaman Absensi bulan ini</p>
                    {isAdmin && (
                        <button
                            onClick={() => router.push(`/dashboard/attendance?year=${calYear}&month=${calMonth}`)}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 bg-violet-50 border border-violet-200 px-4 py-2 rounded-xl hover:bg-violet-100 transition-all"
                        >
                            <RefreshCw className="w-3.5 h-3.5" /> Buka Halaman Absensi Bulan Ini untuk Generate
                        </button>
                    )}
                </div>
            ) : (
                <div className="overflow-x-auto">
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
                            {board.map((u) => {
                                const isTop3 = u.rank <= 3;
                                const tierBg = u.rank === 1 ? "bg-amber-50" : u.rank === 2 ? "bg-gray-50" : u.rank === 3 ? "bg-orange-50/60" : "";
                                return (
                                    <tr key={u.user_id} className={`hover:bg-gray-50/60 transition-colors duration-200 ${tierBg}`}>
                                        <td className="px-6 py-4">
                                            {isTop3 ? <QualityBadgeIcon rank={u.rank} /> : <span className="text-sm font-bold text-gray-400">{u.rank}</span>}
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">{initials(u.name)}</div>
                                                <div>
                                                    <span className="font-bold text-gray-800 block">{u.name}</span>
                                                    <span className="text-[10px] text-gray-400">{(u.role || "").replace(/_/g, " ")}</span>
                                                </div>
                                            </div>
                                        </td>
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
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[100px]">
                                                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-green-500 transition-all duration-700" style={{ width: `${Math.min(100, Number(u.quality_pct))}%` }} />
                                                </div>
                                                <span className="text-sm font-black w-20 text-right flex-shrink-0 text-emerald-600">{formatPct(Number(u.quality_pct))}%</span>
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
    );
}

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

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <p className="text-base font-bold text-gray-800">Lencana Kualitas Pekerjaan</p>
                    <p className="text-[11px] text-gray-500 mt-1 max-w-xl">
                        Diambil dari <strong>Skor Pekerjaan</strong> bulanan (transaksi, preparation, service, konten, akutansi, dst — sesuai divisi masing-masing). Juara Top 3 setiap bulan naik 1 level (bulan pertama Level 1, bulan kedua Level 2, dst — maksimal Level 10). Level 1-2 masih <strong>sementara</strong>: kalau bulan depan gak lanjut Top 3, levelnya reset ke 0. Begitu tembus <strong>Level 3</strong> (3 bulan Top 3 berturut-turut), lencananya jadi <strong>permanen</strong> dan gak akan hilang lagi walau performa turun setelahnya.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => changeMonth(-1)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 transition-all shadow-sm">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="px-4 py-2 bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white rounded-xl font-bold text-xs min-w-[130px] text-center">
                        {MONTH_NAMES[calMonth]} {calYear}
                    </div>
                    <button onClick={() => changeMonth(1)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 transition-all shadow-sm">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {!loading && isOngoingMonth && board.length > 0 && (
                <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <p className="text-[11px] font-semibold text-amber-700">Bulan ini masih berjalan — urutan &amp; level di bawah masih bisa berubah sampai akhir bulan.</p>
                </div>
            )}

            {loading ? (
                <div className="p-6 space-y-3">{Array(5).fill(0).map((_, i) => <div key={i} className="h-14 bg-gray-50 rounded-2xl animate-pulse" />)}</div>
            ) : board.length === 0 ? (
                <div className="py-16 text-center px-6">
                    <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                        <Trophy className="w-7 h-7 text-gray-300" />
                    </div>
                    <p className="text-sm text-gray-400 font-medium">Belum ada leaderboard untuk bulan ini</p>
                    <p className="text-xs text-gray-300 mt-1 mb-4">Generate dulu snapshot skor Pekerjaan bulan ini</p>
                    {isAdmin && (
                        <button
                            onClick={generate}
                            disabled={generating}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 bg-violet-50 border border-violet-200 px-4 py-2 rounded-xl hover:bg-violet-100 transition-all disabled:opacity-50"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`} /> {generating ? "Menghitung..." : "Generate Leaderboard Bulan Ini"}
                        </button>
                    )}
                </div>
            ) : (
                <div className="overflow-x-auto">
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
                            {board.map((u) => {
                                const isTop3 = u.rank <= 3;
                                const tierBg = u.rank === 1 ? "bg-amber-50" : u.rank === 2 ? "bg-gray-50" : u.rank === 3 ? "bg-orange-50/60" : "";
                                return (
                                    <tr key={u.user_id} className={`hover:bg-gray-50/60 transition-colors duration-200 ${tierBg}`}>
                                        <td className="px-6 py-4">
                                            {isTop3 ? <QualityBadgeIcon rank={u.rank} /> : <span className="text-sm font-bold text-gray-400">{u.rank}</span>}
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">{initials(u.name)}</div>
                                                <div>
                                                    <span className="font-bold text-gray-800 block">{u.name}</span>
                                                    <span className="text-[10px] text-gray-400">{(u.role || "").replace(/_/g, " ")}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-center"><LevelBadge level={u.level} isPermanent={u.isPermanent} /></td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[100px]">
                                                    <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-700" style={{ width: `${Math.max((u.score / maxScore) * 100, 4)}%` }} />
                                                </div>
                                                <span className="text-sm font-black w-16 text-right flex-shrink-0 text-indigo-600">{u.score.toLocaleString()}</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
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
            )}
        </div>
    );
}

type PengantaranRow = {
    user_id: string;
    name: string;
    role: string;
    total: number;
    milestone: number;
    rank: number;
};

function MilestoneBadge({ milestone }: { milestone: number }) {
    if (milestone <= 0) return <span className="text-gray-200 font-bold">—</span>;
    return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap bg-orange-100 text-orange-700 border-orange-200">
            <Trophy className="w-3 h-3" /> {milestone}+
        </span>
    );
}

const DELIVERY_MONTH_OPTIONS = [1, 2, 3, 6, 12];

function PengantaranLeaderboard() {
    const [months, setMonths] = useState(1);
    const [board, setBoard] = useState<PengantaranRow[]>([]);
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

    const maxTotal = Math.max(...board.map((u) => u.total), 1);

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-amber-50 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <p className="text-base font-bold text-gray-800">Lencana Pengantaran</p>
                    <p className="text-[11px] text-gray-500 mt-1 max-w-xl">
                        Dihitung dari <strong>total pengantaran berhasil</strong> (status Selesai, metode Pengantaran) dalam periode yang dipilih. Lencana didapat berdasarkan MILESTONE total yang sudah dicapai: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, sampai 1000 pengantaran — bukan level bulanan seperti Absensi/Pekerjaan. Hanya <strong>Top 3</strong> (paling banyak mengantar) di periode ini yang lencananya tampil.
                    </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
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
            </div>

            {loading ? (
                <div className="p-6 space-y-3">{Array(5).fill(0).map((_, i) => <div key={i} className="h-14 bg-gray-50 rounded-2xl animate-pulse" />)}</div>
            ) : board.length === 0 ? (
                <div className="py-16 text-center px-6">
                    <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                        <Trophy className="w-7 h-7 text-gray-300" />
                    </div>
                    <p className="text-sm text-gray-400 font-medium">Belum ada pengantaran di periode ini</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/60">
                                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-14">Rank</th>
                                <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                                <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Lencana</th>
                                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[160px]">Total Diantar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {board.map((u) => {
                                const isTop3 = u.rank <= 3;
                                const tierBg = u.rank === 1 ? "bg-amber-50" : u.rank === 2 ? "bg-gray-50" : u.rank === 3 ? "bg-orange-50/60" : "";
                                return (
                                    <tr key={u.user_id} className={`hover:bg-gray-50/60 transition-colors duration-200 ${tierBg}`}>
                                        <td className="px-6 py-4">
                                            {isTop3 ? <QualityBadgeIcon rank={u.rank} /> : <span className="text-sm font-bold text-gray-400">{u.rank}</span>}
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">{initials(u.name)}</div>
                                                <div>
                                                    <span className="font-bold text-gray-800 block">{u.name}</span>
                                                    <span className="text-[10px] text-gray-400">{(u.role || "").replace(/_/g, " ")}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            {isTop3 ? <MilestoneBadge milestone={u.milestone} /> : <span className="text-gray-200 font-bold">—</span>}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[100px]">
                                                    <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-500 transition-all duration-700" style={{ width: `${Math.max((u.total / maxTotal) * 100, 4)}%` }} />
                                                </div>
                                                <span className="text-sm font-black w-16 text-right flex-shrink-0 text-orange-600">{u.total.toLocaleString()}</span>
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
    );
}

type PenyediaBarangRow = {
    user_id: string;
    name: string;
    role: string;
    total: number;
    milestone: number;
    rank: number;
};

function PenyediaBarangLeaderboard() {
    const [board, setBoard] = useState<PenyediaBarangRow[]>([]);
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

    const maxTotal = Math.max(...board.map((u) => u.total), 1);

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-cyan-50 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <p className="text-base font-bold text-gray-800">Lencana Penyedia Barang</p>
                    <p className="text-[11px] text-gray-500 mt-1 max-w-xl">
                        Dihitung dari <strong>total unit laptop</strong> yang berhasil disiapkan (tidak termasuk item yang dibatalkan) sepanjang waktu bekerja. Lencana didapat berdasarkan MILESTONE total unit yang sudah dicapai: 100, 300, 500, 700, 1000, 1500, 2000, sampai 3000 unit — bersifat kumulatif &amp; permanen begitu tercapai, ditampilkan untuk semua yang sudah meraihnya (tidak dibatasi Top 3).
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="p-6 space-y-3">{Array(5).fill(0).map((_, i) => <div key={i} className="h-14 bg-gray-50 rounded-2xl animate-pulse" />)}</div>
            ) : board.length === 0 ? (
                <div className="py-16 text-center px-6">
                    <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                        <Trophy className="w-7 h-7 text-gray-300" />
                    </div>
                    <p className="text-sm text-gray-400 font-medium">Belum ada data Penyedia Barang</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/60">
                                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-14">Rank</th>
                                <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                                <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Lencana</th>
                                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[160px]">Total Unit Disiapkan</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {board.map((u) => {
                                const isTop3 = u.rank <= 3;
                                const tierBg = u.rank === 1 ? "bg-amber-50" : u.rank === 2 ? "bg-gray-50" : u.rank === 3 ? "bg-orange-50/60" : "";
                                return (
                                    <tr key={u.user_id} className={`hover:bg-gray-50/60 transition-colors duration-200 ${tierBg}`}>
                                        <td className="px-6 py-4">
                                            {isTop3 ? <QualityBadgeIcon rank={u.rank} /> : <span className="text-sm font-bold text-gray-400">{u.rank}</span>}
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">{initials(u.name)}</div>
                                                <div>
                                                    <span className="font-bold text-gray-800 block">{u.name}</span>
                                                    <span className="text-[10px] text-gray-400">{(u.role || "").replace(/_/g, " ")}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <MilestoneBadge milestone={u.milestone} />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[100px]">
                                                    <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-cyan-500 transition-all duration-700" style={{ width: `${Math.max((u.total / maxTotal) * 100, 4)}%` }} />
                                                </div>
                                                <span className="text-sm font-black w-16 text-right flex-shrink-0 text-teal-600">{u.total.toLocaleString()}</span>
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
    );
}

type SalesRow = {
    user_id: string;
    name: string;
    role: string;
    total: number;
    milestone: number;
    rank: number;
};

function SalesLeaderboard() {
    const [board, setBoard] = useState<SalesRow[]>([]);
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

    const maxTotal = Math.max(...board.map((u) => u.total), 1);

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-rose-50 to-pink-50 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <p className="text-base font-bold text-gray-800">Lencana Sales</p>
                    <p className="text-[11px] text-gray-500 mt-1 max-w-xl">
                        Dihitung dari <strong>total transaksi Lunas</strong> yang berhasil diselesaikan sepanjang waktu bekerja. Lencana didapat berdasarkan MILESTONE total transaksi yang sudah dicapai: 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, sampai 20000 transaksi — bersifat kumulatif &amp; permanen begitu tercapai, ditampilkan untuk semua yang sudah meraihnya (tidak dibatasi Top 3).
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="p-6 space-y-3">{Array(5).fill(0).map((_, i) => <div key={i} className="h-14 bg-gray-50 rounded-2xl animate-pulse" />)}</div>
            ) : board.length === 0 ? (
                <div className="py-16 text-center px-6">
                    <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                        <Trophy className="w-7 h-7 text-gray-300" />
                    </div>
                    <p className="text-sm text-gray-400 font-medium">Belum ada data Sales</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/60">
                                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-14">Rank</th>
                                <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                                <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Lencana</th>
                                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[160px]">Total Transaksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {board.map((u) => {
                                const isTop3 = u.rank <= 3;
                                const tierBg = u.rank === 1 ? "bg-amber-50" : u.rank === 2 ? "bg-gray-50" : u.rank === 3 ? "bg-orange-50/60" : "";
                                return (
                                    <tr key={u.user_id} className={`hover:bg-gray-50/60 transition-colors duration-200 ${tierBg}`}>
                                        <td className="px-6 py-4">
                                            {isTop3 ? <QualityBadgeIcon rank={u.rank} /> : <span className="text-sm font-bold text-gray-400">{u.rank}</span>}
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">{initials(u.name)}</div>
                                                <div>
                                                    <span className="font-bold text-gray-800 block">{u.name}</span>
                                                    <span className="text-[10px] text-gray-400">{(u.role || "").replace(/_/g, " ")}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <MilestoneBadge milestone={u.milestone} />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[100px]">
                                                    <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-pink-500 transition-all duration-700" style={{ width: `${Math.max((u.total / maxTotal) * 100, 4)}%` }} />
                                                </div>
                                                <span className="text-sm font-black w-16 text-right flex-shrink-0 text-rose-600">{u.total.toLocaleString()}</span>
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
    );
}

export default function LencanaPage() {
    const [subTab, setSubTab] = useState<SubTab>("absensi");
    const [currentUser, setCurrentUser] = useState<any>(null);

    useEffect(() => {
        getCurrentUserClient().then((u) => setCurrentUser(u));
    }, []);

    return (
        <DashboardLayout>
            <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md flex-shrink-0">
                        <Medal className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">Lencana</h1>
                        <p className="text-xs text-gray-400 mt-0.5">Penghargaan bulanan untuk performa terbaik — juara 1-3 tampil di halaman profil</p>
                    </div>
                </div>

                {/* Sub-navigasi lencana — tambah entry baru di sini kalau ada kategori
                    lencana lain di masa depan. */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5 flex gap-1 flex-wrap">
                    <button
                        onClick={() => setSubTab("absensi")}
                        className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all duration-200 ${subTab === "absensi" ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}
                    >
                        Absensi
                    </button>
                    <button
                        onClick={() => setSubTab("kerja")}
                        className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all duration-200 ${subTab === "kerja" ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}
                    >
                        Pekerjaan
                    </button>
                    <button
                        onClick={() => setSubTab("pengantaran")}
                        className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all duration-200 ${subTab === "pengantaran" ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}
                    >
                        Pengantaran
                    </button>
                    <button
                        onClick={() => setSubTab("penyedia")}
                        className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all duration-200 ${subTab === "penyedia" ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}
                    >
                        Penyedia Barang
                    </button>
                    <button
                        onClick={() => setSubTab("sales")}
                        className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all duration-200 ${subTab === "sales" ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}
                    >
                        Sales
                    </button>
                </div>

                {subTab === "absensi" && <AbsensiLeaderboard isAdmin={isAdminUser(currentUser)} />}
                {subTab === "kerja" && <KerjaLeaderboard isAdmin={isAdminUser(currentUser)} />}
                {subTab === "pengantaran" && <PengantaranLeaderboard />}
                {subTab === "penyedia" && <PenyediaBarangLeaderboard />}
                {subTab === "sales" && <SalesLeaderboard />}
            </div>
        </DashboardLayout>
    );
}