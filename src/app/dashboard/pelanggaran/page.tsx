"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getCurrentUserClient } from "@/lib/auth-client";
import {
    Trophy, ChevronLeft, ChevronRight, Lock, Clock, Crown,
    AlertTriangle, Ban, Plus, X, Check, Send, UserPlus, Copy, Loader2,
    type LucideIcon,
} from "lucide-react";

/* ============================================================
   Gating role (HARUS sinkron dgn VIOLATION_MANAGE_ROLES /
   VIOLATION_WARNING_ROLES di lib/permissions.ts — enforcement
   asli ada di API, ini cuma nentuin tampil/tidaknya tombol).
   ============================================================ */
const VIOLATION_MANAGE_ROLES = ["ADMIN", "PROGRAMMER"] as const;
const VIOLATION_WARNING_ROLES = [
    "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
    "KEPALA_SALES", "KEPALA_ZENITH", "KEPALA_MARKETING", "KEPALA_TEKNISI",
    "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH", "KEPALA_PENGELOLA_BARANG", "KEPALA_CC",
] as const;
function rolesOf(user: any): string[] {
    return Array.isArray(user?.roles) && user.roles.length > 0 ? user.roles : (user?.role ? [user.role] : []);
}
function isViolationAdmin(user: any): boolean {
    return rolesOf(user).some((r) => (VIOLATION_MANAGE_ROLES as readonly string[]).includes(r));
}
function isViolationWarner(user: any): boolean {
    return rolesOf(user).some((r) => (VIOLATION_WARNING_ROLES as readonly string[]).includes(r));
}

/* ============================================================
   Helper & komponen kecil (diambil dari pola halaman Lencana
   supaya tampilan konsisten).
   ============================================================ */
const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
function initials(name: string): string { return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase(); }
function roleLabel(role: string): string { return (role || "").replace(/_/g, " "); }
function tierBgFor(rank: number): string { return rank === 1 ? "bg-amber-50" : rank === 2 ? "bg-gray-50" : rank === 3 ? "bg-orange-50/60" : ""; }

type Accent = { bar: string; chip: string; blob: string; ring: string };
const ACC_ROSE: Accent = { bar: "from-rose-400 to-pink-500", chip: "bg-gradient-to-br from-rose-100 to-rose-200 text-rose-600", blob: "bg-rose-200/40", ring: "ring-rose-100" };
const ACC_AMBER: Accent = { bar: "from-amber-400 to-orange-500", chip: "bg-gradient-to-br from-amber-100 to-amber-200 text-amber-600", blob: "bg-amber-200/40", ring: "ring-amber-100" };

function SectionHeader({ icon: Icon, accent, title, description, children }: { icon: LucideIcon; accent: Accent; title: string; description: ReactNode; children?: ReactNode; }) {
    return (
        <>
            <div className={`h-1.5 w-full bg-gradient-to-r ${accent.bar}`} />
            <div className="relative overflow-hidden px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className={`pointer-events-none absolute -top-10 -left-10 w-36 h-36 rounded-full blur-3xl ${accent.blob}`} />
                <div className="relative flex items-start gap-3 min-w-0">
                    <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm ring-4 ${accent.ring} ${accent.chip}`}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-base sm:text-lg font-extrabold text-gray-900 tracking-tight">{title}</p>
                        <p className="text-[11px] sm:text-xs text-gray-500 mt-1.5 max-w-xl sm:max-w-2xl leading-relaxed">{description}</p>
                    </div>
                </div>
                {children && <div className="relative flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-between sm:justify-end flex-wrap">{children}</div>}
            </div>
        </>
    );
}

function MonthNavigator({ month, year, onChange }: { month: number; year: number; onChange: (delta: number) => void }) {
    return (
        <div className="flex items-center gap-2">
            <button onClick={() => onChange(-1)} aria-label="Bulan sebelumnya" className="w-9 h-9 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 hover:shadow-md active:scale-95 transition-all shadow-sm"><ChevronLeft className="w-4 h-4" /></button>
            <div className="px-4 py-2 bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white rounded-full font-bold text-xs min-w-[130px] text-center shadow-md shadow-gray-900/10 tracking-wide">{MONTH_NAMES[month]} {year}</div>
            <button onClick={() => onChange(1)} aria-label="Bulan berikutnya" className="w-9 h-9 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 hover:shadow-md active:scale-95 transition-all shadow-sm"><ChevronRight className="w-4 h-4" /></button>
        </div>
    );
}

function OngoingMonthBanner() {
    return (
        <div className="px-4 sm:px-6 py-3 bg-gradient-to-r from-amber-50 to-orange-50/60 border-b border-amber-100 flex items-center gap-2">
            <span className="relative flex h-2 w-2 flex-shrink-0"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" /></span>
            <p className="text-[11px] font-semibold text-amber-700">Bulan ini masih berjalan — poin &amp; urutan di bawah masih bisa berubah sampai akhir bulan.</p>
        </div>
    );
}

function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="p-4 sm:p-6 space-y-3">
            {Array(rows).fill(0).map((_, i) => (
                <div key={i} className="flex items-center gap-3 sm:gap-4 h-16 sm:h-14 bg-gray-50 rounded-2xl px-4">
                    <div className="w-9 h-9 rounded-xl bg-gray-200/70 animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-2"><div className="h-2.5 w-1/3 bg-gray-200/70 rounded-full animate-pulse" /><div className="h-2 w-1/5 bg-gray-200/50 rounded-full animate-pulse" /></div>
                    <div className="h-2.5 w-16 bg-gray-200/70 rounded-full animate-pulse hidden sm:block" />
                </div>
            ))}
        </div>
    );
}

function EmptyState({ message, hint }: { message: string; hint?: string }) {
    return (
        <div className="py-14 sm:py-20 text-center px-6">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center mx-auto mb-4 ring-8 ring-gray-50"><Trophy className="w-8 h-8 text-gray-300" /></div>
            <p className="text-sm text-gray-500 font-semibold">{message}</p>
            {hint && <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">{hint}</p>}
        </div>
    );
}

function KaryawanCell({ name, role }: { name: string; role: string }) {
    return (
        <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-sm ring-2 ring-white">{initials(name)}</div>
            <div className="min-w-0"><span className="font-bold text-gray-800 block truncate">{name}</span><span className="text-[10px] text-gray-400">{roleLabel(role)}</span></div>
        </div>
    );
}

function LevelBadge({ level, isPermanent }: { level: number; isPermanent: boolean }) {
    if (level <= 0) return <span className="text-gray-200 font-bold">—</span>;
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap shadow-sm ring-1 ring-inset ${isPermanent ? "bg-emerald-100 text-emerald-700 border-emerald-200 ring-emerald-200/50" : "bg-amber-100 text-amber-700 border-amber-200 ring-amber-200/50"}`}>
            {isPermanent ? <Lock className="w-3 h-3" /> : <Clock className="w-3 h-3" />} Lvl {level}{isPermanent ? " · Permanen" : ""}
        </span>
    );
}

function QualityBadgeIcon({ rank }: { rank: number }) {
    const tier: "gold" | "silver" | "bronze" = rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze";
    const gradients: Record<typeof tier, string> = { gold: "linear-gradient(135deg, #fde047, #f59e0b, #b45309)", silver: "linear-gradient(135deg, #f8fafc, #94a3b8, #475569)", bronze: "linear-gradient(135deg, #fdba74, #c2410c, #7c2d12)" };
    return <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-black shadow-md ring-2 ring-white flex-shrink-0" style={{ background: gradients[tier] }}>{rank}</span>;
}
function RankSlot({ rank }: { rank: number }) {
    return rank <= 3 ? <QualityBadgeIcon rank={rank} /> : <span className="w-8 h-8 flex items-center justify-center text-sm font-bold text-gray-400 bg-gray-50 rounded-full flex-shrink-0">{rank}</span>;
}

function ProgressBar({ pct, gradient, valueLabel, valueColorClass, valueWidthClass = "" }: { pct: number; gradient: string; valueLabel: string; valueColorClass: string; valueWidthClass?: string; }) {
    const width = Math.max(Math.min(pct, 100), 0);
    return (
        <div className="flex items-center gap-3">
            <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden min-w-[90px] shadow-inner"><div className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-700 ease-out`} style={{ width: `${width}%` }} /></div>
            <span className={`text-sm font-black text-right flex-shrink-0 ${valueWidthClass} ${valueColorClass}`}>{valueLabel}</span>
        </div>
    );
}

function AbsensiStatChip({ label, value, tone }: { label: string; value: ReactNode; tone: string }) {
    return (
        <div className="bg-gray-50/80 rounded-xl px-2 py-2 text-center border border-gray-100/80">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">{label}</p>
            <p className={`text-sm font-black mt-0.5 ${tone}`}>{value}</p>
        </div>
    );
}

/* ── Podium (Top 3) ── */
type PodiumEntry = { user_id: string; name: string; role: string; rank: number; metricLabel: string; extra?: ReactNode };
const PODIUM_TIER = {
    1: { order: "order-2", lift: "-translate-y-2 sm:-translate-y-5", scale: "sm:scale-105", ring: "ring-2 ring-amber-300/70", cardBg: "bg-gradient-to-b from-amber-50 to-white", badgeGradient: "linear-gradient(135deg, #fde047, #f59e0b, #b45309)", metricClass: "bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent", avatarRing: "ring-4 ring-amber-200/70", shadow: "shadow-lg shadow-amber-200/40" },
    2: { order: "order-1", lift: "", scale: "", ring: "ring-2 ring-slate-300/70", cardBg: "bg-gradient-to-b from-slate-50 to-white", badgeGradient: "linear-gradient(135deg, #f8fafc, #94a3b8, #475569)", metricClass: "bg-gradient-to-r from-slate-500 to-slate-700 bg-clip-text text-transparent", avatarRing: "ring-2 ring-slate-200/70", shadow: "shadow-sm" },
    3: { order: "order-3", lift: "", scale: "", ring: "ring-2 ring-orange-300/70", cardBg: "bg-gradient-to-b from-orange-50 to-white", badgeGradient: "linear-gradient(135deg, #fdba74, #c2410c, #7c2d12)", metricClass: "bg-gradient-to-r from-orange-600 to-red-700 bg-clip-text text-transparent", avatarRing: "ring-2 ring-orange-200/70", shadow: "shadow-sm" },
} as const;
function PodiumSlot({ entry, tier }: { entry?: PodiumEntry; tier: 1 | 2 | 3 }) {
    const style = PODIUM_TIER[tier];
    if (!entry) return <div className={style.order} />;
    return (
        <div className={`${style.order} ${style.lift} ${style.scale} podium-rise flex flex-col items-center text-center rounded-2xl border border-gray-100 ${style.cardBg} ${style.ring} ${style.shadow} p-3 sm:p-4 transition-transform duration-300`} style={{ animationDelay: `${(tier - 1) * 90}ms` }}>
            {tier === 1 && <Crown className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500 mb-1 drop-shadow-sm" />}
            <div className={`w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-white text-[10px] sm:text-xs font-black mb-2 shadow-md ${style.avatarRing}`} style={{ background: "linear-gradient(135deg,#1a1a2e,#16213e)" }}>{initials(entry.name)}</div>
            <p className="text-[11px] sm:text-xs font-bold text-gray-800 truncate max-w-[92px] sm:max-w-[130px]">{entry.name}</p>
            <p className="text-[9px] sm:text-[10px] text-gray-400 mb-2 truncate max-w-[92px] sm:max-w-[130px]">{roleLabel(entry.role)}</p>
            <span className="inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full text-white text-[10px] sm:text-[11px] font-black shadow-md ring-2 ring-white mb-2" style={{ background: style.badgeGradient }}>{tier}</span>
            <p className={`text-base sm:text-xl font-black ${style.metricClass}`}>{entry.metricLabel}</p>
            {entry.extra && <div className="mt-2">{entry.extra}</div>}
        </div>
    );
}
function Podium({ entries }: { entries: PodiumEntry[] }) {
    const byRank = (r: number) => entries.find((e) => e.rank === r);
    return (
        <div className="relative overflow-hidden px-4 sm:px-6 pt-5 sm:pt-8 pb-4 sm:pb-6 bg-gray-50/40 border-b border-gray-100">
            <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-gradient-to-b from-amber-100/60 to-transparent blur-2xl" />
            <div className="relative grid grid-cols-3 gap-2 sm:gap-4 items-end max-w-lg mx-auto">
                <PodiumSlot entry={byRank(2)} tier={2} /><PodiumSlot entry={byRank(1)} tier={1} /><PodiumSlot entry={byRank(3)} tier={3} />
            </div>
            <style jsx>{`@keyframes podiumRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .podium-rise { animation: podiumRise 0.5s ease-out both; }`}</style>
        </div>
    );
}

/* ============================================================
   Tipe & meta khusus Pelanggaran
   ============================================================ */
type SimpleUser = { id: string; name: string; role: string };
type VPenalty = { id: string; case_id: string; user_id: string; name: string; role: string; points_deducted: number; severity_applied: string; active: boolean };
type VCase = {
    id: string; violation_type: string; severity: string; area: string | null; shift: string | null;
    incident_date: string; reason: string; status: string; division: string | null;
    reported_by: string | null; reported_by_name: string | null; hidden_discovery: boolean;
    quiet_period_ends_at: string | null; escalated_at: string | null;
    warning_sent_at: string | null; warning_message: string | null; warning_target: string | null;
    warning_sent_by: string | null; warning_sent_by_name: string | null; penalties: VPenalty[]; created_at: string;
};
type NetRow = {
    user_id: string; name: string; role: string; quality_pct: number; kerja_score: number; base_points: number;
    violation_points: number; net_points: number; rank: number; level: number; isPermanent: boolean; isTemporary: boolean; streakMonths: number;
};

const SEVERITY_META: Record<string, { label: string; points: string; cls: string }> = {
    RINGAN: { label: "Ringan", points: "−1", cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    SEDANG: { label: "Sedang", points: "−5", cls: "bg-orange-100 text-orange-700 border-orange-200" },
    BERAT: { label: "Berat", points: "−10", cls: "bg-red-100 text-red-700 border-red-200" },
    SANGAT_BERAT: { label: "Sangat Berat", points: "PHK", cls: "bg-gray-900 text-white border-gray-900" },
};
const VSTATUS_META: Record<string, { label: string; cls: string; icon: LucideIcon }> = {
    MENUNGGU_PENGAKUAN: { label: "Menunggu Pengakuan", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
    PENALTI_BERJALAN: { label: "Penalti Berjalan", cls: "bg-rose-50 text-rose-700 border-rose-200", icon: Ban },
    PERLU_TINDAKAN_ATASAN: { label: "Perlu Tindakan Atasan", cls: "bg-orange-50 text-orange-700 border-orange-200", icon: AlertTriangle },
    SELESAI_TEGURAN: { label: "Selesai — Teguran Terkirim", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: Check },
    DIBATALKAN: { label: "Dibatalkan", cls: "bg-gray-100 text-gray-500 border-gray-200", icon: X },
    PHK: { label: "PHK — Akun Dinonaktifkan", cls: "bg-gray-900 text-white border-gray-900", icon: Ban },
};
function SeverityBadge({ severity }: { severity: string }) {
    const m = SEVERITY_META[severity] ?? SEVERITY_META.RINGAN;
    return <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${m.cls}`}>{m.label} · {m.points}</span>;
}
function VStatusBadge({ status }: { status: string }) {
    const m = VSTATUS_META[status] ?? VSTATUS_META.MENUNGGU_PENGAKUAN; const Icon = m.icon;
    return <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${m.cls}`}><Icon className="w-3 h-3" /> {m.label}</span>;
}
function fmtTanggal(d: string): string { const dt = new Date(`${d}T00:00:00`); return `${dt.getDate()} ${MONTH_NAMES[dt.getMonth()]} ${dt.getFullYear()}`; }
function fmtNet(n: number): string { return (Math.round(n * 10) / 10).toLocaleString("id-ID"); }
function sisaMasaTenang(iso: string | null): string | null {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return "habis";
    const h = Math.ceil(ms / 3600000);
    if (h >= 24) { const d = Math.floor(h / 24); const hh = h % 24; return `± ${d} hari ${hh} jam lagi`; }
    return `± ${h} jam lagi`;
}
function buildTeguranText(c: VCase): string {
    return `Halo tim 👋. Tanggal ${fmtTanggal(c.incident_date)} ada temuan ${c.violation_type}${c.area ? ` di ${c.area}` : ""}, dan sampai batas 3 hari belum ada yang mengonfirmasi. Mohon ke depannya lebih dijaga ya. Kalau merasa terkait, silakan konfirmasi ke atasan. Terima kasih 🙏 — Solit 03`;
}

function UserMultiPicker({ users, selected, onToggle }: { users: SimpleUser[]; selected: string[]; onToggle: (id: string) => void }) {
    const [q, setQ] = useState("");
    const filtered = q.trim() ? users.filter((u) => u.name.toLowerCase().includes(q.toLowerCase())) : users;
    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari karyawan..." className="w-full h-9 px-3 text-sm border-b border-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-200" />
            <div className="max-h-44 overflow-y-auto divide-y divide-gray-50">
                {filtered.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">Tidak ada karyawan</p> : filtered.map((u) => {
                    const on = selected.includes(u.id);
                    return (
                        <button key={u.id} type="button" onClick={() => onToggle(u.id)} className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${on ? "bg-violet-50" : "hover:bg-gray-50"}`}>
                            <span className={`w-4 h-4 rounded flex items-center justify-center border flex-shrink-0 ${on ? "bg-violet-600 border-violet-600" : "border-gray-300"}`}>{on && <Check className="w-3 h-3 text-white" />}</span>
                            <span className="flex-1 min-w-0 truncate font-semibold text-gray-700">{u.name}</span>
                            <span className="text-[10px] text-gray-400 flex-shrink-0">{roleLabel(u.role)}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* ============================================================
   Board utama (logika identik dgn batch sebelumnya)
   ============================================================ */
function PelanggaranBoard({ currentUser }: { currentUser: any }) {
    const isAdmin = isViolationAdmin(currentUser);
    const canWarn = isViolationWarner(currentUser);

    const today = new Date();
    const [calYear, setCalYear] = useState(today.getFullYear());
    const [calMonth, setCalMonth] = useState(today.getMonth());
    const [netRows, setNetRows] = useState<NetRow[]>([]);
    const [cases, setCases] = useState<VCase[]>([]);
    const [loadingNet, setLoadingNet] = useState(true);
    const [loadingCases, setLoadingCases] = useState(true);
    const [isOngoingMonth, setIsOngoingMonth] = useState(false);
    const [users, setUsers] = useState<SimpleUser[]>([]);
    const [busyCaseId, setBusyCaseId] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const [showCreate, setShowCreate] = useState(false);
    const [cType, setCType] = useState("");
    const [cSeverity, setCSeverity] = useState("RINGAN");
    const [cArea, setCArea] = useState("");
    const [cShift, setCShift] = useState("");
    const [cDate, setCDate] = useState(() => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10));
    const [cDivision, setCDivision] = useState("");
    const [cReason, setCReason] = useState("");
    const [cPelaku, setCPelaku] = useState<string[]>([]);

    const [assignCase, setAssignCase] = useState<VCase | null>(null);
    const [assignSel, setAssignSel] = useState<string[]>([]);

    const [teguranCase, setTeguranCase] = useState<VCase | null>(null);
    const [teguranText, setTeguranText] = useState("");
    const [teguranTarget, setTeguranTarget] = useState("");
    const [copied, setCopied] = useState(false);

    const loadNet = useCallback(async (y: number, m: number) => {
        setLoadingNet(true);
        try {
            const r = await fetch(`/api/violations?list=true&year=${y}&month=${m + 1}`);
            const d = await r.json();
            if (d.success) { setNetRows(d.data || []); setIsOngoingMonth(!!d.isOngoingMonth); }
        } catch { } finally { setLoadingNet(false); }
    }, []);
    const loadCases = useCallback(async (y: number, m: number) => {
        setLoadingCases(true);
        try {
            const r = await fetch(`/api/violations?year=${y}&month=${m + 1}`);
            const d = await r.json();
            if (d.success) setCases(d.data || []);
        } catch { } finally { setLoadingCases(false); }
    }, []);

    useEffect(() => { loadNet(calYear, calMonth); loadCases(calYear, calMonth); }, [calYear, calMonth, loadNet, loadCases]);
    useEffect(() => {
        if (!isAdmin) return;
        fetch("/api/users").then((r) => r.json()).then((d) => { if (d.success) setUsers((d.users || []).map((u: any) => ({ id: u.id, name: u.name, role: u.role }))); }).catch(() => { });
    }, [isAdmin]);

    const changeMonth = (delta: number) => {
        let m = calMonth + delta; let y = calYear;
        if (m < 0) { m = 11; y -= 1; } if (m > 11) { m = 0; y += 1; }
        setCalMonth(m); setCalYear(y);
    };
    const reloadAll = () => Promise.all([loadNet(calYear, calMonth), loadCases(calYear, calMonth)]);
    const resetCreate = () => { setCType(""); setCSeverity("RINGAN"); setCArea(""); setCShift(""); setCDivision(""); setCReason(""); setCPelaku([]); setCDate(new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)); };

    const submitCreate = async () => {
        if (!cType.trim() || !cDate || !cReason.trim()) { alert("Jenis, tanggal, dan alasan wajib diisi"); return; }
        if ((cSeverity === "BERAT" || cSeverity === "SANGAT_BERAT") && cPelaku.length === 0) { alert("Pelanggaran Berat & Sangat Berat wajib pilih pelaku yang jelas"); return; }
        let confirmPhk = false;
        if (cSeverity === "SANGAT_BERAT") {
            if (!confirm("PHK bersifat PERMANEN & tidak bisa dibatalkan. Akun pelaku akan dinonaktifkan. Lanjutkan?")) return;
            if (!confirm("Konfirmasi SEKALI LAGI — yakin mem-PHK & menonaktifkan akun pelaku terpilih?")) return;
            confirmPhk = true;
        }
        setSubmitting(true);
        try {
            const r = await fetch("/api/violations", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ violation_type: cType.trim(), severity: cSeverity, area: cArea.trim() || null, shift: cShift || null, incident_date: cDate, reason: cReason.trim(), division: cDivision.trim() || null, pelaku_ids: cPelaku, confirm_phk: confirmPhk || undefined }),
            });
            const d = await r.json();
            if (d.success) { resetCreate(); setShowCreate(false); await reloadAll(); } else alert(d.message || "Gagal membuat pelanggaran");
        } catch { alert("Terjadi kesalahan jaringan"); } finally { setSubmitting(false); }
    };

    const openAssign = (c: VCase) => { setAssignCase(c); setAssignSel(c.penalties.filter((p) => p.active).map((p) => p.user_id)); };
    const submitAssign = async () => {
        if (!assignCase) return;
        if (assignSel.length === 0) { alert("Pilih minimal 1 pelaku"); return; }
        setSubmitting(true);
        try {
            const r = await fetch(`/api/violations/${assignCase.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign", pelaku_ids: assignSel }) });
            const d = await r.json();
            if (d.success) { setAssignCase(null); setAssignSel([]); await reloadAll(); if (d.bumped) alert(`Karena ketahuan belakangan (bukan langsung ngaku), penalti naik 1 tingkat jadi ${SEVERITY_META[d.appliedSeverity]?.label ?? d.appliedSeverity}.`); }
            else alert(d.message || "Gagal menetapkan pelaku");
        } catch { alert("Terjadi kesalahan jaringan"); } finally { setSubmitting(false); }
    };

    const cancelCase = async (c: VCase) => {
        if (!confirm("Batalkan pelanggaran ini? Poin yang sempat terpotong akan dikembalikan otomatis.")) return;
        setBusyCaseId(c.id);
        try {
            const r = await fetch(`/api/violations/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
            const d = await r.json();
            if (d.success) await reloadAll(); else alert(d.message || "Gagal membatalkan");
        } catch { alert("Terjadi kesalahan jaringan"); } finally { setBusyCaseId(null); }
    };

    const openTeguran = (c: VCase) => { setTeguranCase(c); setTeguranText(buildTeguranText(c)); setTeguranTarget(c.division || ""); setCopied(false); };
    const copyTeguran = async () => { try { await navigator.clipboard.writeText(teguranText); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { } };
    const submitTeguran = async () => {
        if (!teguranCase) return;
        setSubmitting(true);
        try {
            const r = await fetch(`/api/violations/${teguranCase.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "teguran", warning_message: teguranText, warning_target: teguranTarget || null }) });
            const d = await r.json();
            if (d.success) { setTeguranCase(null); await loadCases(calYear, calMonth); } else alert(d.message || "Gagal menandai teguran");
        } catch { alert("Terjadi kesalahan jaringan"); } finally { setSubmitting(false); }
    };

    const maxNet = Math.max(...netRows.map((u) => u.net_points), 1);
    const podiumEntries: PodiumEntry[] = netRows.filter((u) => u.rank <= 3).map((u) => ({ user_id: u.user_id, name: u.name, role: u.role, rank: u.rank, metricLabel: fmtNet(u.net_points), extra: <LevelBadge level={u.level} isPermanent={u.isPermanent} /> }));

    return (
        <div className="space-y-5 sm:space-y-7">
            {/* ── Bagian 1: Papan Poin Akhir ── */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg hover:shadow-gray-100 transition-shadow duration-300 overflow-hidden">
                <SectionHeader icon={AlertTriangle} accent={ACC_ROSE} title="Poin Akhir Setelah Pelanggaran"
                    description={<>Poin akhir = <strong>skor Absensi (persen)</strong> + <strong>Skor Pekerjaan</strong> bulan ini, dikurangi <strong>total poin pelanggaran</strong> yang masih aktif. Poin <strong>boleh minus</strong> dan ditampilkan apa adanya. Pelanggaran menekan kenaikan level bulan ini, tapi <strong>tidak mencabut level permanen (Level 3+)</strong>.</>}>
                    <MonthNavigator month={calMonth} year={calYear} onChange={changeMonth} />
                </SectionHeader>

                {!loadingNet && netRows.length > 0 && <Podium entries={podiumEntries} />}
                {!loadingNet && isOngoingMonth && netRows.length > 0 && <OngoingMonthBanner />}

                {loadingNet ? <LoadingSkeleton /> : netRows.length === 0 ? (
                    <EmptyState message="Belum ada data poin bulan ini" hint="Papan ini mengambil skor dari tab Absensi & Pekerjaan di halaman Lencana. Pastikan snapshot bulan ini sudah ter-generate di sana." />
                ) : (
                    <>
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b-2 border-gray-100 bg-gray-50/80">
                                        <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-14">Rank</th>
                                        <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                                        <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Level</th>
                                        <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Absensi</th>
                                        <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Skor Kerja</th>
                                        <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Pelanggaran</th>
                                        <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[160px]">Poin Akhir</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {netRows.map((u) => (
                                        <tr key={u.user_id} className={`hover:bg-gray-50/70 transition-colors duration-150 ${tierBgFor(u.rank)}`}>
                                            <td className="px-6 py-4"><RankSlot rank={u.rank} /></td>
                                            <td className="px-4 py-4"><KaryawanCell name={u.name} role={u.role} /></td>
                                            <td className="px-4 py-4 text-center"><LevelBadge level={u.level} isPermanent={u.isPermanent} /></td>
                                            <td className="px-4 py-4 text-center text-gray-600 font-semibold">{u.quality_pct.toFixed(1)}</td>
                                            <td className="px-4 py-4 text-center text-gray-600 font-semibold">{Math.round(u.kerja_score).toLocaleString("id-ID")}</td>
                                            <td className="px-4 py-4 text-center">{u.violation_points > 0 ? <span className="text-red-600 font-bold">−{fmtNet(u.violation_points)}</span> : <span className="text-gray-200 font-bold">—</span>}</td>
                                            <td className="px-6 py-4"><ProgressBar pct={(u.net_points / maxNet) * 100} gradient="from-rose-400 to-pink-500" valueLabel={fmtNet(u.net_points)} valueColorClass={u.net_points < 0 ? "text-red-600" : "text-rose-600"} valueWidthClass="w-16" /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="md:hidden p-3 sm:p-4 space-y-2.5 bg-gray-50/40">
                            {netRows.map((u) => (
                                <div key={u.user_id} className={`p-4 space-y-3 rounded-2xl border border-gray-100 shadow-sm ${tierBgFor(u.rank) || "bg-white"}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-3 min-w-0"><RankSlot rank={u.rank} /><KaryawanCell name={u.name} role={u.role} /></div>
                                        <LevelBadge level={u.level} isPermanent={u.isPermanent} />
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <AbsensiStatChip label="Absensi" value={u.quality_pct.toFixed(1)} tone="text-gray-700" />
                                        <AbsensiStatChip label="Skor Kerja" value={Math.round(u.kerja_score).toLocaleString("id-ID")} tone="text-indigo-600" />
                                        <AbsensiStatChip label="Pelanggaran" value={u.violation_points > 0 ? `−${fmtNet(u.violation_points)}` : "—"} tone="text-red-500" />
                                    </div>
                                    <ProgressBar pct={(u.net_points / maxNet) * 100} gradient="from-rose-400 to-pink-500" valueLabel={`Poin Akhir: ${fmtNet(u.net_points)}`} valueColorClass={u.net_points < 0 ? "text-red-600" : "text-rose-600"} />
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* ── Bagian 2: Daftar Kasus ── */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <SectionHeader icon={Ban} accent={ACC_AMBER} title="Daftar Kasus Pelanggaran"
                    description={<>Catatan kasus bulan ini (difilter dari tanggal kejadian). Pelaku boleh dikosongkan dulu → masuk <strong>masa tenang 3 hari</strong>. Lewat 3 hari tanpa pelaku → <strong>Perlu Tindakan Atasan</strong>, atasan menegur manual di grup WA lalu menandainya di sini.</>}>
                    {isAdmin && <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-[#1a1a2e] to-[#16213e] px-4 py-2.5 rounded-full hover:shadow-md active:scale-95 transition-all shadow-sm"><Plus className="w-3.5 h-3.5" /> Tambah Pelanggaran</button>}
                </SectionHeader>

                {loadingCases ? <LoadingSkeleton rows={3} /> : cases.length === 0 ? (
                    <EmptyState message="Belum ada kasus pelanggaran bulan ini" hint={isAdmin ? 'Klik "Tambah Pelanggaran" untuk mencatat yang pertama' : undefined} />
                ) : (
                    <div className="p-4 sm:p-6 space-y-3">
                        {cases.map((c) => {
                            const activePelaku = c.penalties.filter((p) => p.active);
                            const tenang = c.status === "MENUNGGU_PENGAKUAN" ? sisaMasaTenang(c.quiet_period_ends_at) : null;
                            const bisaTetapkan = isAdmin && c.severity !== "SANGAT_BERAT" && ["MENUNGGU_PENGAKUAN", "PERLU_TINDAKAN_ATASAN", "SELESAI_TEGURAN"].includes(c.status);
                            const bisaBatal = isAdmin && !["DIBATALKAN", "PHK"].includes(c.status);
                            const bisaTegur = canWarn && c.status === "PERLU_TINDAKAN_ATASAN";
                            return (
                                <div key={c.id} className={`rounded-2xl border border-gray-100 p-4 space-y-3 ${c.status === "DIBATALKAN" ? "bg-gray-50/60 opacity-75" : "bg-white"}`}>
                                    <div className="flex items-start justify-between gap-2 flex-wrap">
                                        <div className="min-w-0"><p className="text-sm font-black text-gray-900">{c.violation_type}</p><p className="text-[11px] text-gray-400 mt-0.5">{fmtTanggal(c.incident_date)}{c.area ? ` · ${c.area}` : ""}{c.shift ? ` · ${c.shift}` : ""}</p></div>
                                        <div className="flex items-center gap-1.5 flex-wrap justify-end"><SeverityBadge severity={c.severity} /><VStatusBadge status={c.status} /></div>
                                    </div>
                                    <p className="text-xs text-gray-600 leading-relaxed bg-gray-50/70 rounded-lg px-3 py-2">{c.reason}</p>
                                    {activePelaku.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {activePelaku.map((p) => <span key={p.id} className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">{p.name} <span className="text-red-500">−{fmtNet(p.points_deducted)}</span></span>)}
                                        </div>
                                    )}
                                    {tenang && <p className="text-[11px] font-semibold text-amber-600 flex items-center gap-1"><Clock className="w-3 h-3" /> Masa tenang berakhir {tenang}</p>}
                                    {c.status === "SELESAI_TEGURAN" && c.warning_sent_by_name && <p className="text-[11px] text-emerald-600">Ditegur oleh {c.warning_sent_by_name}{c.warning_target ? ` → ${c.warning_target}` : ""}</p>}
                                    <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-gray-50">
                                        <p className="text-[10px] text-gray-300">{c.reported_by_name ? `Dilaporkan oleh ${c.reported_by_name}` : "Pelapor —"}</p>
                                        <div className="flex items-center gap-1.5">
                                            {bisaTegur && <button onClick={() => openTeguran(c)} className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-full hover:bg-orange-100 active:scale-95 transition-all"><Send className="w-3 h-3" /> Tandai Teguran</button>}
                                            {bisaTetapkan && <button onClick={() => openAssign(c)} className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 bg-violet-50 border border-violet-200 px-3 py-1.5 rounded-full hover:bg-violet-100 active:scale-95 transition-all"><UserPlus className="w-3 h-3" /> {activePelaku.length > 0 ? "Ubah Pelaku" : "Tetapkan Pelaku"}</button>}
                                            {bisaBatal && <button onClick={() => cancelCase(c)} disabled={busyCaseId === c.id} className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-400 hover:text-red-600 border border-gray-200 hover:border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-full active:scale-95 transition-all disabled:opacity-50">{busyCaseId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />} Batalkan</button>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Modal: Tambah Pelanggaran ── */}
            {showCreate && (
                <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreate(false)} />
                    <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[88vh] overflow-y-auto">
                        <div className="flex items-center justify-between"><h3 className="font-black text-gray-900">Tambah Pelanggaran</h3><button onClick={() => setShowCreate(false)} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button></div>
                        <div><label className="text-xs font-bold text-gray-500 block mb-1.5">Jenis Pelanggaran</label><input value={cType} onChange={(e) => setCType(e.target.value)} placeholder="Misal: Buang sampah sembarangan, Telat parah" className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" /></div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 block mb-1.5">Kategori</label>
                            <div className="grid grid-cols-2 gap-2">
                                {(["RINGAN", "SEDANG", "BERAT", "SANGAT_BERAT"] as const).map((s) => <button key={s} type="button" onClick={() => setCSeverity(s)} className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${cSeverity === s ? "border-violet-400 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>{SEVERITY_META[s].label} <span className="opacity-70">({SEVERITY_META[s].points})</span></button>)}
                            </div>
                            {cSeverity === "SANGAT_BERAT" && <p className="text-[11px] font-bold text-red-600 mt-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Ini akan menonaktifkan akun pelaku (PHK) permanen & minta konfirmasi 2×.</p>}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className="text-xs font-bold text-gray-500 block mb-1.5">Tanggal</label><input type="date" value={cDate} onChange={(e) => setCDate(e.target.value)} className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" /></div>
                            <div><label className="text-xs font-bold text-gray-500 block mb-1.5">Shift (opsional)</label><select value={cShift} onChange={(e) => setCShift(e.target.value)} className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"><option value="">—</option><option value="PAGI">Pagi</option><option value="SORE">Sore</option></select></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className="text-xs font-bold text-gray-500 block mb-1.5">Area (opsional)</label><input value={cArea} onChange={(e) => setCArea(e.target.value)} placeholder="Gudang, Toko…" className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" /></div>
                            <div><label className="text-xs font-bold text-gray-500 block mb-1.5">Divisi/Tujuan Teguran</label><input value={cDivision} onChange={(e) => setCDivision(e.target.value)} placeholder="Divisi Kebersihan…" className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" /></div>
                        </div>
                        <div><label className="text-xs font-bold text-gray-500 block mb-1.5">Alasan / Keterangan</label><textarea value={cReason} onChange={(e) => setCReason(e.target.value)} rows={2} placeholder="Wajib diisi…" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" /></div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 block mb-1.5">Pelaku {cSeverity === "BERAT" || cSeverity === "SANGAT_BERAT" ? <span className="text-red-500">(wajib)</span> : <span className="text-gray-400 font-normal">(kosongkan → masa tenang 3 hari)</span>}</label>
                            <UserMultiPicker users={users} selected={cPelaku} onToggle={(id) => setCPelaku((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])} />
                            {cPelaku.length > 0 && <p className="text-[11px] text-gray-400 mt-1.5">{cPelaku.length} pelaku dipilih</p>}
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button onClick={() => setShowCreate(false)} className="flex-1 h-10 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200">Batal</button>
                            <button onClick={submitCreate} disabled={submitting || !cType.trim() || !cReason.trim()} className="flex-1 h-10 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#1a1a2e] to-[#16213e] disabled:opacity-50 flex items-center justify-center gap-2">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simpan"}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Tetapkan Pelaku ── */}
            {assignCase && (
                <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setAssignCase(null)} />
                    <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[85vh] overflow-y-auto">
                        <div className="flex items-center justify-between"><h3 className="font-black text-gray-900">Tetapkan Pelaku</h3><button onClick={() => setAssignCase(null)} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button></div>
                        <p className="text-xs text-gray-500">{assignCase.violation_type} · {fmtTanggal(assignCase.incident_date)}</p>
                        {["PERLU_TINDAKAN_ATASAN", "SELESAI_TEGURAN"].includes(assignCase.status) && <p className="text-[11px] font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> Ketahuan belakangan — penalti otomatis naik 1 tingkat (menutupi lebih mahal daripada ngaku).</p>}
                        <UserMultiPicker users={users} selected={assignSel} onToggle={(id) => setAssignSel((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])} />
                        <div className="flex gap-2 pt-1">
                            <button onClick={() => setAssignCase(null)} className="flex-1 h-10 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200">Batal</button>
                            <button onClick={submitAssign} disabled={submitting || assignSel.length === 0} className="flex-1 h-10 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#1a1a2e] to-[#16213e] disabled:opacity-50 flex items-center justify-center gap-2">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Potong Poin"}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Tandai Teguran ── */}
            {teguranCase && (
                <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setTeguranCase(null)} />
                    <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[85vh] overflow-y-auto">
                        <div className="flex items-center justify-between"><h3 className="font-black text-gray-900">Teguran Grup (Manual)</h3><button onClick={() => setTeguranCase(null)} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button></div>
                        <p className="text-[11px] text-gray-500">Salin teks di bawah, kirim manual ke grup WA divisi, lalu tandai di sini untuk jejak audit. Sistem tidak mengirim WA.</p>
                        <div>
                            <label className="text-xs font-bold text-gray-500 block mb-1.5">Teks Teguran</label>
                            <textarea value={teguranText} onChange={(e) => setTeguranText(e.target.value)} rows={5} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
                            <button onClick={copyTeguran} className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-violet-600 bg-violet-50 border border-violet-200 px-3 py-1.5 rounded-full hover:bg-violet-100 active:scale-95 transition-all">{copied ? <><Check className="w-3 h-3" /> Tersalin</> : <><Copy className="w-3 h-3" /> Salin Teks</>}</button>
                        </div>
                        <div><label className="text-xs font-bold text-gray-500 block mb-1.5">Tujuan (grup/divisi) — opsional</label><input value={teguranTarget} onChange={(e) => setTeguranTarget(e.target.value)} placeholder="Grup WA Divisi Kebersihan" className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" /></div>
                        <div className="flex gap-2 pt-1">
                            <button onClick={() => setTeguranCase(null)} className="flex-1 h-10 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200">Batal</button>
                            <button onClick={submitTeguran} disabled={submitting} className="flex-1 h-10 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#1a1a2e] to-[#16213e] disabled:opacity-50 flex items-center justify-center gap-2">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Tandai Sudah Ditegur"}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ============================================================
   Halaman (default export) — dibungkus DashboardLayout + header
   ============================================================ */
export default function PelanggaranPage() {
    const [currentUser, setCurrentUser] = useState<any>(null);
    useEffect(() => { getCurrentUserClient().then((u) => setCurrentUser(u)); }, []);

    return (
        <DashboardLayout>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-5 sm:space-y-7">
                <div className="flex items-center gap-3 sm:gap-4">
                    <div className="relative flex-shrink-0">
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-rose-300 to-red-400 blur-lg opacity-50" />
                        <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-rose-400 to-red-500 flex items-center justify-center shadow-lg ring-4 ring-white"><AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-white" /></div>
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">Pelanggaran</h1>
                        <p className="text-[11px] sm:text-sm text-gray-500 mt-0.5">Catatan pelanggaran & poin akhir karyawan setelah penalti</p>
                    </div>
                </div>
                <PelanggaranBoard currentUser={currentUser} />
            </div>
        </DashboardLayout>
    );
}