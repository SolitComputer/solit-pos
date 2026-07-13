"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";
import DashboardLayout from "@/components/layout/DashboardLayout";

// ── Types ─────────────────────────────────────────────────────────────────────
type UserRole = string;

type PKLReport = {
    id: string;
    user_id: string;
    division: string;
    report_date: string;
    title: string;
    description: string;
    status: "SUBMITTED" | "REVIEWED" | "REVISION";
    review_note: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
    users?: { id: string; name: string; role: string };
    reviewer?: { id: string; name: string; role: string } | null;
    created_by_admin?: string | null;
};

type PKLUser = { id: string; name: string; role: string };

const FULL_ACCESS = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING"];
const KEPALA_ROLES = [
    "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
    "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH",
];

const DIVISIONS = [
    { id: "MARKETING", label: "Marketing", emoji: "📣", color: "bg-pink-100 text-pink-700 border-pink-200" },
    { id: "SALES", label: "Sales", emoji: "🛒", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    { id: "PENYEDIA_BARANG", label: "Penyedia Barang", emoji: "📦", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    { id: "TEKNISI", label: "Teknisi", emoji: "🔧", color: "bg-orange-100 text-orange-700 border-orange-200" },
    { id: "ONPOINT", label: "Onpoint", emoji: "🎯", color: "bg-blue-100 text-blue-700 border-blue-200" },
    { id: "SOTECH", label: "Sotech", emoji: "💻", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
    { id: "UMUM", label: "Umum", emoji: "📋", color: "bg-gray-100 text-gray-700 border-gray-200" },
];

const STATUS_CONFIG = {
    SUBMITTED: { label: "Terkirim", emoji: "📤", bg: "bg-blue-100", color: "text-blue-700", border: "border-blue-200" },
    REVIEWED: { label: "Disetujui", emoji: "✅", bg: "bg-emerald-100", color: "text-emerald-700", border: "border-emerald-200" },
    REVISION: { label: "Revisi", emoji: "🔄", bg: "bg-amber-100", color: "text-amber-700", border: "border-amber-200" },
};

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// ── Shared style tokens (biar konsisten & DRY) ────────────────────────────────
const CARD_STYLE = {
    border: "1px solid #eef0f6",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 14px 32px -16px rgba(15,23,42,0.14)",
} as const;
const NAVY_GRADIENT = "linear-gradient(135deg, #0f0c29 0%, #1a1545 100%)";
const NAVY_SHADOW = "0 8px 22px -6px rgba(15,12,41,0.45)";
const SECTION_HEAD = {
    borderBottom: "1px solid #f2f3fa",
    background: "linear-gradient(180deg, #fbfcff 0%, #f7f9ff 100%)",
} as const;

// ── Calendar tokens ───────────────────────────────────────────────────────────
const DAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const DOT_COLOR: Record<string, string> = {
    REVIEWED: "#10b981",
    SUBMITTED: "#3b82f6",
    REVISION: "#f59e0b",
};
const CELL_TINT: Record<string, string> = {
    REVIEWED: "#ecfdf5",
    SUBMITTED: "#eff6ff",
    REVISION: "#fffbeb",
};
const CELL_TEXT: Record<string, string> = {
    REVIEWED: "#047857",
    SUBMITTED: "#1d4ed8",
    REVISION: "#b45309",
};
const CELL_BORDER: Record<string, string> = {
    REVIEWED: "#a7f3d0",
    SUBMITTED: "#bfdbfe",
    REVISION: "#fde68a",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function isFullAccess(role?: string) { return !!role && FULL_ACCESS.includes(role); }
function isKepala(role?: string) { return !!role && KEPALA_ROLES.includes(role); }
function isPKL(role?: string) { return !!role && (role === "PKL" || role.startsWith("PKL_") || role.startsWith("PKL-")); }
function canAccessPage(role?: string) { return isFullAccess(role) || isKepala(role) || isPKL(role); }
function canReview(role?: string) { return isFullAccess(role) || isKepala(role); }
function canAddManual(role?: string) { return isFullAccess(role); }

function initials(name: string) {
    return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}
function pad2(n: number) { return String(n).padStart(2, "0"); }
function getWIBToday() {
    return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function formatDate(iso: string) {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function formatDateShort(iso: string) {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
function getDivisionInfo(id: string) {
    return DIVISIONS.find(d => d.id === id) ?? { id, label: id, emoji: "📋", color: "bg-gray-100 text-gray-700 border-gray-200" };
}
function shiftMonth(ym: string, delta: number) {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

// ── Section Header (dipakai ulang di beberapa kartu) ──────────────────────────
function SectionHeader({ title, subtitle, right }: {
    title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-3 px-5 py-3.5" style={SECTION_HEAD}>
            <div className="min-w-0">
                <p className="text-[13px] font-bold text-[#0f172a] truncate">{title}</p>
                {subtitle && <p className="text-[10px] text-[#94a3b8] mt-0.5 truncate">{subtitle}</p>}
            </div>
            {right && <div className="flex-shrink-0">{right}</div>}
        </div>
    );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, gradient, tint, loading }: {
    icon: string; value: number; label: string; gradient: string; tint: string; loading: boolean;
}) {
    return (
        <div className="group relative bg-white rounded-2xl p-4 overflow-hidden transition-all duration-300 hover:-translate-y-0.5"
            style={CARD_STYLE}>
            {/* soft corner glow */}
            <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-[0.10] transition-opacity duration-300 group-hover:opacity-25"
                style={{ background: gradient }} />
            <div className="relative flex items-start justify-between mb-3.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[15px] leading-none ring-1 ring-inset ring-white/60"
                    style={{ background: tint }}>
                    {icon}
                </div>
            </div>
            <p className="relative text-[27px] font-black text-[#0f172a] tabular-nums leading-none tracking-tight">
                {loading
                    ? <span className="inline-block w-9 h-7 bg-[#f1f5f9] rounded-lg animate-pulse" />
                    : value}
            </p>
            <p className="relative text-[10px] font-bold uppercase tracking-wider text-[#94a3b8] mt-2">{label}</p>
            <div className="relative mt-2.5 h-[3px] w-8 rounded-full opacity-70 transition-all duration-300 group-hover:w-14"
                style={{ background: gradient }} />
        </div>
    );
}

// ── Mini Calendar (lebih besar & lebih terbaca) ───────────────────────────────
function MiniCalendar({
    month,
    reports,
    isPKLUser,
    filterDate,
    onMonthChange,
    onPickDate,
}: {
    month: string;
    reports: PKLReport[];
    isPKLUser: boolean;
    filterDate: string | null;
    onMonthChange: (m: string) => void;
    onPickDate: (date: string, existing: PKLReport | null) => void;
}) {
    const today = getWIBToday();
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const firstDay = new Date(y, m - 1, 1).getDay();
    const atCurrentMonth = month >= today.slice(0, 7);
    const isCurrentMonth = month === today.slice(0, 7);

    const byDate = useMemo(() => {
        const map = new Map<string, PKLReport[]>();
        reports.forEach(r => {
            const arr = map.get(r.report_date);
            if (arr) arr.push(r);
            else map.set(r.report_date, [r]);
        });
        return map;
    }, [reports]);

    // Prioritas warna: ada revisi → REVISION, semua disetujui → REVIEWED, sisanya → SUBMITTED
    const statusOf = (dk: string): keyof typeof DOT_COLOR | null => {
        const list = byDate.get(dk);
        if (!list || list.length === 0) return null;
        if (list.some(r => r.status === "REVISION")) return "REVISION";
        if (list.every(r => r.status === "REVIEWED")) return "REVIEWED";
        return "SUBMITTED";
    };

    const navBtn =
        "w-8 h-8 flex items-center justify-center rounded-lg border border-[#e8ecf5] bg-white text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1a1545] transition-all disabled:opacity-30 disabled:cursor-not-allowed";

    return (
        <div className="bg-white rounded-2xl overflow-hidden" style={CARD_STYLE}>
            {/* Header + navigasi bulan */}
            <div className="flex items-center justify-between gap-3 px-5 py-3.5" style={SECTION_HEAD}>
                <div className="min-w-0">
                    <p className="text-[15px] font-black text-[#0f172a] truncate tracking-tight">
                        {MONTH_NAMES[m - 1]} <span className="text-[#94a3b8] font-bold">{y}</span>
                    </p>
                    <p className="text-[10px] text-[#94a3b8] mt-0.5">
                        {isPKLUser ? "Klik tanggal untuk buat / lihat laporan" : "Klik tanggal untuk filter tabel"}
                    </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!isCurrentMonth && (
                        <button
                            onClick={() => onMonthChange(today.slice(0, 7))}
                            className="h-8 px-3 rounded-lg border border-[#e8ecf5] bg-white text-[10px] font-bold text-[#475569] hover:bg-[#f1f5f9] transition-all"
                        >
                            Hari ini
                        </button>
                    )}
                    <button
                        onClick={() => onMonthChange(shiftMonth(month, -1))}
                        className={navBtn}
                        aria-label="Bulan sebelumnya"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <button
                        onClick={() => onMonthChange(shiftMonth(month, 1))}
                        disabled={atCurrentMonth}
                        className={navBtn}
                        aria-label="Bulan berikutnya"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="px-4 pt-4 pb-4">
                {/* Nama hari */}
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-2">
                    {DAY_LABELS.map((d, i) => (
                        <div key={d + i}
                            className={`text-center text-[10px] font-black uppercase tracking-wide py-1 ${i === 0 ? "text-[#fb7185]" : "text-[#b8c1d1]"}`}>
                            {d}
                        </div>
                    ))}
                </div>

                {/* Grid tanggal */}
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                    {Array(firstDay).fill(null).map((_, i) => <div key={`e-${i}`} className="h-[52px] sm:h-14" />)}

                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                        const dk = `${y}-${pad2(m)}-${pad2(day)}`;
                        const st = statusOf(dk);
                        const count = byDate.get(dk)?.length ?? 0;
                        const isToday = dk === today;
                        const isFuture = dk > today;
                        const isSelected = filterDate === dk;
                        const isSunday = new Date(y, m - 1, day).getDay() === 0;

                        const cellStyle: React.CSSProperties = isSelected
                            ? { background: NAVY_GRADIENT, color: "#fff", boxShadow: NAVY_SHADOW, border: "1px solid transparent" }
                            : st
                                ? { background: CELL_TINT[st], color: CELL_TEXT[st], border: `1px solid ${CELL_BORDER[st]}` }
                                : { border: "1px solid transparent" };

                        return (
                            <button
                                key={day}
                                disabled={isFuture}
                                onClick={() => onPickDate(dk, byDate.get(dk)?.[0] ?? null)}
                                style={cellStyle}
                                title={
                                    isFuture
                                        ? "Tanggal belum berjalan"
                                        : count > 0
                                            ? `${count} laporan · ${formatDateShort(dk)}`
                                            : formatDateShort(dk)
                                }
                                className={`relative h-[52px] sm:h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 text-[15px] font-bold transition-all duration-200
                                    focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40
                                    ${isFuture
                                        ? "text-[#e2e8f0] cursor-not-allowed"
                                        : isSelected
                                            ? "scale-[1.03]"
                                            : st
                                                ? "hover:scale-[1.05] hover:shadow-sm cursor-pointer"
                                                : `cursor-pointer hover:bg-[#f5f7ff] ${isSunday ? "text-[#fb7185]" : "text-[#64748b]"}`
                                    }
                                    ${isToday && !isSelected ? "ring-[2px] ring-[#1a1545] ring-offset-1 ring-offset-white" : ""}`}
                            >
                                <span className="tabular-nums leading-none">{day}</span>

                                {/* indikator status */}
                                {st && !isSelected && (
                                    <span className="flex items-center gap-[3px] leading-none">
                                        <span className="w-[5px] h-[5px] rounded-full" style={{ background: DOT_COLOR[st] }} />
                                        {count > 1 && (
                                            <span className="text-[9px] font-black tabular-nums" style={{ color: DOT_COLOR[st] }}>
                                                {count}
                                            </span>
                                        )}
                                    </span>
                                )}
                                {st && isSelected && (
                                    <span className="w-[5px] h-[5px] rounded-full bg-white/80" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-3 flex-wrap mt-4 pt-3" style={{ borderTop: "1px solid #f2f3fa" }}>
                    {[
                        { c: DOT_COLOR.REVIEWED, l: "Disetujui" },
                        { c: DOT_COLOR.SUBMITTED, l: "Terkirim" },
                        { c: DOT_COLOR.REVISION, l: "Revisi" },
                    ].map(({ c, l }) => (
                        <span key={l} className="flex items-center gap-1.5 text-[10px] font-semibold text-[#94a3b8]">
                            <span className="w-2 h-2 rounded-full" style={{ background: c }} />{l}
                        </span>
                    ))}
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[#94a3b8]">
                        <span className="w-3 h-3 rounded-md ring-[2px] ring-[#1a1545]" />Hari ini
                    </span>
                </div>
            </div>
        </div>
    );
}

// ── Month Insight ─────────────────────────────────────────────────────────────
function MonthInsight({
    month,
    reports,
    isPKLUser,
    pklUsers,
    onPickDate,
}: {
    month: string;
    reports: PKLReport[];
    isPKLUser: boolean;
    pklUsers: PKLUser[];
    onPickDate: (date: string) => void;
}) {
    const today = getWIBToday();
    const curMonth = today.slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const elapsed = month === curMonth ? Number(today.slice(8, 10)) : month < curMonth ? daysInMonth : 0;

    const reportedDates = useMemo(() => new Set(reports.map(r => r.report_date)), [reports]);

    // Hari kerja = Senin–Sabtu (Minggu dikecualikan)
    const workDays = useMemo(() => {
        const arr: string[] = [];
        for (let d = 1; d <= elapsed; d++) {
            if (new Date(y, m - 1, d).getDay() === 0) continue;
            arr.push(`${y}-${pad2(m)}-${pad2(d)}`);
        }
        return arr;
    }, [y, m, elapsed]);

    const missing = useMemo(() => workDays.filter(d => !reportedDates.has(d)), [workDays, reportedDates]);
    const filled = workDays.length - missing.length;
    const pct = workDays.length > 0 ? Math.round((filled / workDays.length) * 100) : 0;

    const counts = useMemo(() => ({
        SUBMITTED: reports.filter(r => r.status === "SUBMITTED").length,
        REVIEWED: reports.filter(r => r.status === "REVIEWED").length,
        REVISION: reports.filter(r => r.status === "REVISION").length,
    }), [reports]);
    const total = counts.SUBMITTED + counts.REVIEWED + counts.REVISION;

    const notReportedToday = useMemo(() => {
        if (isPKLUser) return [];
        const done = new Set(reports.filter(r => r.report_date === today).map(r => r.user_id));
        return pklUsers.filter(u => !done.has(u.id));
    }, [isPKLUser, pklUsers, reports, today]);

    const R = 30;
    const CIRC = 2 * Math.PI * R;
    const ringColor = pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#f43f5e";

    return (
        <div className="bg-white rounded-2xl overflow-hidden h-full" style={CARD_STYLE}>
            <SectionHeader
                title={<>✨ Ringkasan {MONTH_NAMES[m - 1]}</>}
                subtitle={isPKLUser ? "Kepatuhan laporan harianmu (Senin–Sabtu)" : "Sebaran status & pemantauan harian"}
            />

            <div className="p-5 space-y-5">
                <div className="flex items-center gap-5">
                    {/* Ring progress */}
                    <div className="relative flex-shrink-0" style={{ width: 78, height: 78 }}>
                        <svg width="78" height="78" className="-rotate-90">
                            <circle cx="39" cy="39" r={R} fill="none" stroke="#f1f5f9" strokeWidth="8" />
                            <circle
                                cx="39" cy="39" r={R} fill="none"
                                stroke={ringColor} strokeWidth="8" strokeLinecap="round"
                                strokeDasharray={CIRC}
                                strokeDashoffset={CIRC - (CIRC * pct) / 100}
                                style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1)" }}
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[16px] font-black text-[#0f172a] tabular-nums">{pct}%</span>
                        </div>
                    </div>

                    <div className="min-w-0">
                        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide">
                            {isPKLUser ? "Kepatuhan Laporan" : "Hari Ada Laporan"}
                        </p>
                        <p className="text-[24px] font-black text-[#0f172a] leading-tight tabular-nums tracking-tight">
                            {filled}<span className="text-sm text-[#cbd5e1] font-bold"> / {workDays.length} hari</span>
                        </p>
                        <p className="text-[10px] text-[#94a3b8] mt-0.5">
                            {total} laporan masuk bulan ini
                        </p>
                    </div>
                </div>

                {/* Stacked status bar */}
                {total > 0 && (
                    <div>
                        <div className="flex h-2.5 rounded-full overflow-hidden bg-[#f1f5f9] gap-[2px]">
                            {(["REVIEWED", "SUBMITTED", "REVISION"] as const).map(k =>
                                counts[k] > 0 ? (
                                    <div key={k}
                                        style={{ width: `${(counts[k] / total) * 100}%`, background: DOT_COLOR[k] }}
                                        className="transition-all duration-700"
                                    />
                                ) : null
                            )}
                        </div>
                        <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                            {([["REVIEWED", "Disetujui"], ["SUBMITTED", "Terkirim"], ["REVISION", "Revisi"]] as const).map(([k, label]) => (
                                <span key={k} className="flex items-center gap-1.5 text-[10px] font-semibold text-[#64748b]">
                                    <span className="w-2 h-2 rounded-full" style={{ background: DOT_COLOR[k] }} />
                                    {label} <span className="font-black text-[#0f172a] tabular-nums">{counts[k]}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* PKL: hari yang belum dilaporkan */}
                {isPKLUser && missing.length > 0 && (
                    <div className="pt-4" style={{ borderTop: "1px solid #f2f3fa" }}>
                        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-2">
                            ⚠️ Belum dilaporkan ({missing.length}) — klik untuk isi
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {missing.slice(-8).map(d => (
                                <button
                                    key={d}
                                    onClick={() => onPickDate(d)}
                                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-[#fff7ed] text-[#c2410c] border border-[#fed7aa] hover:bg-[#ffedd5] hover:border-[#fdba74] transition-all active:scale-[0.97]"
                                >
                                    + {formatDateShort(d).replace(/ \d{4}$/, "")}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {isPKLUser && missing.length === 0 && workDays.length > 0 && (
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-[#ecfdf5] border border-[#a7f3d0]">
                        <span className="text-lg">🎉</span>
                        <p className="text-[11px] font-bold text-[#047857]">Semua hari kerja sudah dilaporkan!</p>
                    </div>
                )}

                {/* Admin/Kepala: PKL belum lapor hari ini */}
                {!isPKLUser && pklUsers.length > 0 && (
                    <div className="pt-4" style={{ borderTop: "1px solid #f2f3fa" }}>
                        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-2">
                            Belum lapor hari ini ({notReportedToday.length}/{pklUsers.length})
                        </p>
                        {notReportedToday.length === 0 ? (
                            <p className="text-[11px] font-bold text-[#047857]">✅ Semua PKL sudah mengirim laporan hari ini</p>
                        ) : (
                            <div className="flex flex-wrap gap-1.5">
                                {notReportedToday.map(u => (
                                    <span key={u.id}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-[#fff1f2] text-[#be123c] border border-[#fecdd3]">
                                        <span className="w-4 h-4 rounded-md bg-[#fecdd3] text-[7px] flex items-center justify-center text-[#9f1239]">
                                            {initials(u.name)}
                                        </span>
                                        {u.name.split(" ")[0]}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Modal: Tambah/Edit Laporan ────────────────────────────────────────────────
function ReportFormModal({
    currentUser,
    editData,
    prefillDate,
    prefillDivision,
    prefillUserId,
    allPKLUsers,
    onClose,
    onSaved,
}: {
    currentUser: any;
    editData?: PKLReport | null;
    prefillDate?: string | null;
    prefillDivision?: string;
    prefillUserId?: string;
    allPKLUsers?: PKLUser[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const isEdit = !!editData;
    const isAdminAdd = canAddManual(currentUser?.role) && !!prefillUserId && prefillUserId !== currentUser?.id;

    const [form, setForm] = useState({
        report_date: editData?.report_date ?? prefillDate ?? getWIBToday(),
        division: editData?.division ?? prefillDivision ?? DIVISIONS[0].id,
        title: editData?.title ?? "",
        description: editData?.description ?? "",
        pkl_user_id: prefillUserId ?? currentUser?.id ?? "",
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const save = async () => {
        if (!form.description.trim()) { setError("Deskripsi laporan wajib diisi"); return; }
        if (!form.report_date) { setError("Tanggal laporan wajib diisi"); return; }
        setSaving(true); setError("");

        try {
            let body: Record<string, any>;
            let method = "POST";
            const url = "/api/pkl-reports";

            if (isEdit) {
                method = "PATCH";
                body = { id: editData!.id, title: form.title, description: form.description };
            } else if (isAdminAdd) {
                body = {
                    action: "admin_add",
                    pkl_user_id: form.pkl_user_id,
                    division: form.division,
                    report_date: form.report_date,
                    title: form.title || `Laporan ${form.report_date}`,
                    description: form.description,
                };
            } else {
                body = {
                    division: form.division,
                    report_date: form.report_date,
                    title: form.title || `Laporan ${form.report_date}`,
                    description: form.description,
                };
            }

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const d = await res.json();
            if (!d.success) { setError(d.message || "Gagal menyimpan"); return; }
            onSaved(); onClose();
        } catch { setError("Gagal menyimpan"); }
        finally { setSaving(false); }
    };

    const inputCls =
        "w-full h-11 border border-[#e8ecf5] rounded-xl px-3.5 text-sm bg-[#f7f9ff] text-[#334155] focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-300 focus:bg-white transition-all";
    const labelCls = "block text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-1.5";

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-[#0f0c29]/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-scaleIn">
                {/* Handle bar mobile */}
                <div className="sm:hidden absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-white/30 z-10" />

                {/* Header */}
                <div className="relative overflow-hidden px-6 py-5 flex items-start justify-between flex-shrink-0"
                    style={{ background: NAVY_GRADIENT }}>
                    <div className="absolute -top-10 -right-6 w-40 h-40 rounded-full blur-3xl opacity-30"
                        style={{ background: "radial-gradient(circle, #7c3aed, transparent 70%)" }} />
                    <div className="relative">
                        <p className="font-black text-white text-base tracking-tight">
                            {isEdit ? "✏️ Edit Laporan Kerja" : isAdminAdd ? "➕ Tambah Laporan (Admin)" : "📝 Buat Laporan Kerja"}
                        </p>
                        <p className="text-xs text-white/55 mt-1">
                            {isEdit ? "Update isi laporan kerja PKL" : "Catat kegiatan kerja harian PKL"}
                        </p>
                    </div>
                    <button onClick={onClose} className="relative w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                    {error && (
                        <div className="bg-[#fff1f2] border border-[#fecdd3] text-[#be123c] text-xs px-4 py-3 rounded-xl flex items-center gap-2">
                            <span>⚠️</span>{error}
                        </div>
                    )}

                    {/* Pilih PKL — admin only */}
                    {canAddManual(currentUser?.role) && !isEdit && allPKLUsers && allPKLUsers.length > 0 && (
                        <div>
                            <label className={labelCls}>PKL yang dimasukkan laporannya</label>
                            <select
                                value={form.pkl_user_id}
                                onChange={e => setForm(f => ({ ...f, pkl_user_id: e.target.value }))}
                                className={inputCls}
                            >
                                <option value="">— Pilih PKL —</option>
                                {allPKLUsers.map(u => (
                                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Divisi */}
                    {!isEdit && (
                        <div>
                            <label className={labelCls}>Divisi Penempatan</label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {DIVISIONS.map(div => (
                                    <button
                                        key={div.id}
                                        type="button"
                                        onClick={() => setForm(f => ({ ...f, division: div.id }))}
                                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all active:scale-[0.97]"
                                        style={form.division === div.id
                                            ? { background: NAVY_GRADIENT, color: "#fff", borderColor: "transparent", boxShadow: NAVY_SHADOW }
                                            : { background: "#fff", color: "#64748b", borderColor: "#e2e8f0" }}
                                    >
                                        <span>{div.emoji}</span>
                                        <span className="truncate">{div.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tanggal */}
                    {!isEdit && (
                        <div>
                            <label className={labelCls}>Tanggal Laporan</label>
                            <input
                                type="date"
                                value={form.report_date}
                                max={getWIBToday()}
                                onChange={e => setForm(f => ({ ...f, report_date: e.target.value }))}
                                className={inputCls}
                            />
                        </div>
                    )}

                    {/* Judul */}
                    <div>
                        <label className={labelCls}>
                            Judul <span className="text-[#cbd5e1] font-normal normal-case">(opsional)</span>
                        </label>
                        <input
                            type="text"
                            value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            placeholder={`Contoh: Laporan Kerja ${form.report_date}`}
                            className={inputCls}
                        />
                    </div>

                    {/* Deskripsi */}
                    <div>
                        <label className={labelCls}>
                            Deskripsi Kegiatan Kerja <span className="text-red-400">*</span>
                        </label>
                        <textarea
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            rows={6}
                            placeholder={`Ceritakan kegiatan yang dilakukan hari ini:\n- Tugas apa yang dikerjakan\n- Hasil yang dicapai\n- Kendala yang dihadapi (jika ada)\n- Hal yang dipelajari`}
                            className="w-full border border-[#e8ecf5] rounded-xl px-3.5 py-3 text-sm bg-[#f7f9ff] text-[#334155] focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-300 focus:bg-white transition-all resize-none leading-relaxed"
                        />
                        <p className="text-[10px] text-[#94a3b8] mt-1 text-right tabular-nums">
                            {form.description.length} karakter
                        </p>
                    </div>

                    {/* Preview info */}
                    {form.report_date && form.description && (
                        <div className="bg-[#fafbff] border border-[#f0f0f8] rounded-2xl px-4 py-3.5">
                            <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-2">Pratinjau</p>
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${getDivisionInfo(form.division).color}`}>
                                    {getDivisionInfo(form.division).emoji} {getDivisionInfo(form.division).label}
                                </span>
                                <span className="text-[10px] text-[#94a3b8]">{formatDateShort(form.report_date)}</span>
                            </div>
                            <p className="text-xs text-[#64748b] line-clamp-2 leading-relaxed">{form.description}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-[#f1f5f9] flex-shrink-0 flex gap-3 bg-white">
                    <button onClick={onClose} className="flex-1 h-11 bg-[#f1f5f9] text-[#64748b] rounded-xl text-sm font-semibold hover:bg-[#e2e8f0] transition-all">
                        Batal
                    </button>
                    <button
                        onClick={save}
                        disabled={saving || !form.description.trim()}
                        className="flex-1 h-11 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                        style={{ background: NAVY_GRADIENT, boxShadow: NAVY_SHADOW }}
                    >
                        {saving
                            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>
                            : isEdit ? "💾 Simpan Perubahan" : "📤 Kirim Laporan"
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Modal: Review Laporan ─────────────────────────────────────────────────────
function ReviewModal({
    report,
    currentUser,
    onClose,
    onSaved,
}: {
    report: PKLReport;
    currentUser: any;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [note, setNote] = useState(report.review_note ?? "");
    const [status, setStatus] = useState<"REVIEWED" | "REVISION">("REVIEWED");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const submit = async () => {
        setSaving(true); setError("");
        try {
            const res = await fetch("/api/pkl-reports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "review", report_id: report.id, review_note: note, status }),
            });
            const d = await res.json();
            if (!d.success) { setError(d.message || "Gagal"); return; }
            onSaved(); onClose();
        } catch { setError("Gagal menyimpan"); }
        finally { setSaving(false); }
    };

    const div = getDivisionInfo(report.division);

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-[#0f0c29]/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-scaleIn">
                <div className="relative overflow-hidden px-6 py-5 flex items-start justify-between flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)" }}>
                    <div className="absolute -top-10 -right-6 w-40 h-40 rounded-full blur-3xl opacity-30"
                        style={{ background: "radial-gradient(circle, #a78bfa, transparent 70%)" }} />
                    <div className="relative">
                        <p className="font-black text-white text-base tracking-tight">🔍 Review Laporan</p>
                        <p className="text-xs text-white/70 mt-1">{report.users?.name ?? "—"} · {formatDateShort(report.report_date)}</p>
                    </div>
                    <button onClick={onClose} className="relative w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                    {error && <div className="bg-[#fff1f2] border border-[#fecdd3] text-[#be123c] text-xs px-4 py-3 rounded-xl">⚠️ {error}</div>}

                    {/* Isi laporan */}
                    <div className="bg-[#fafbff] border border-[#f0f0f8] rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${div.color}`}>
                                {div.emoji} {div.label}
                            </span>
                            <span className="text-xs text-[#94a3b8]">{formatDate(report.report_date)}</span>
                        </div>
                        {report.title && <p className="font-bold text-[#0f172a] text-sm mb-1">{report.title}</p>}
                        <p className="text-sm text-[#475569] leading-relaxed whitespace-pre-line">{report.description}</p>
                    </div>

                    {/* Status review */}
                    <div>
                        <label className="block text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-2">Status Review</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setStatus("REVIEWED")}
                                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold border transition-all active:scale-[0.98] ${status === "REVIEWED"
                                    ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/25"
                                    : "bg-white text-[#64748b] border-[#e2e8f0] hover:bg-[#f8fafc]"
                                    }`}>
                                <span>✅</span> Disetujui
                            </button>
                            <button type="button" onClick={() => setStatus("REVISION")}
                                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold border transition-all active:scale-[0.98] ${status === "REVISION"
                                    ? "bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/25"
                                    : "bg-white text-[#64748b] border-[#e2e8f0] hover:bg-[#f8fafc]"
                                    }`}>
                                <span>🔄</span> Perlu Revisi
                            </button>
                        </div>
                    </div>

                    {/* Catatan reviewer */}
                    <div>
                        <label className="block text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-1.5">
                            Catatan Review <span className="text-[#cbd5e1] font-normal normal-case">(opsional)</span>
                        </label>
                        <textarea
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            rows={3}
                            placeholder="Tambahkan masukan, arahan, atau catatan untuk PKL ini..."
                            className="w-full border border-[#e8ecf5] rounded-xl px-3.5 py-3 text-sm bg-[#f7f9ff] text-[#334155] focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-300 focus:bg-white transition-all resize-none"
                        />
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-[#f1f5f9] flex gap-3 flex-shrink-0 bg-white">
                    <button onClick={onClose} className="flex-1 h-11 bg-[#f1f5f9] text-[#64748b] rounded-xl text-sm font-semibold hover:bg-[#e2e8f0] transition-all">Batal</button>
                    <button onClick={submit} disabled={saving}
                        className="flex-1 h-11 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                        style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 8px 22px -6px rgba(124,58,237,0.5)" }}>
                        {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : "✔️ Simpan Review"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Modal: Detail Laporan ─────────────────────────────────────────────────────
function ReportDetailModal({
    report,
    currentUser,
    onClose,
    onEdit,
    onReview,
    onDelete,
}: {
    report: PKLReport;
    currentUser: any;
    onClose: () => void;
    onEdit: () => void;
    onReview: () => void;
    onDelete: () => void;
}) {
    const div = getDivisionInfo(report.division);
    const status = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.SUBMITTED;
    const isOwner = currentUser?.id === report.user_id;
    const canEdit = isPKL(currentUser?.role) && isOwner && report.status !== "REVIEWED";
    const canDel = isOwner || isFullAccess(currentUser?.role);
    const canDoReview = canReview(currentUser?.role);

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-[#0f0c29]/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-scaleIn">
                <div className="relative overflow-hidden px-6 py-5 flex items-start justify-between flex-shrink-0"
                    style={{ background: NAVY_GRADIENT }}>
                    <div className="absolute -top-10 -right-6 w-40 h-40 rounded-full blur-3xl opacity-30"
                        style={{ background: "radial-gradient(circle, #7c3aed, transparent 70%)" }} />
                    <div className="relative">
                        <p className="font-black text-white text-base tracking-tight">📄 Detail Laporan</p>
                        <p className="text-xs text-white/60 mt-1">
                            {report.users?.name ?? "—"} · {formatDateShort(report.report_date)}
                        </p>
                    </div>
                    <button onClick={onClose} className="relative w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                    {/* Meta */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${div.color}`}>
                            {div.emoji} {div.label}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${status.bg} ${status.color} ${status.border}`}>
                            {status.emoji} {status.label}
                        </span>
                        {report.created_by_admin && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border bg-violet-100 text-violet-700 border-violet-200">
                                🔒 Input Admin
                            </span>
                        )}
                    </div>

                    {/* Tanggal */}
                    <div className="bg-[#fafbff] border border-[#f0f0f8] rounded-xl px-4 py-3">
                        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-0.5">Tanggal</p>
                        <p className="text-sm font-bold text-[#0f172a]">{formatDate(report.report_date)}</p>
                    </div>

                    {/* Judul */}
                    {report.title && (
                        <div>
                            <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-1">Judul</p>
                            <p className="text-sm font-bold text-[#0f172a]">{report.title}</p>
                        </div>
                    )}

                    {/* Deskripsi */}
                    <div>
                        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-2">Deskripsi Kegiatan</p>
                        <div className="bg-white border border-[#f0f0f8] rounded-xl px-4 py-3">
                            <p className="text-sm text-[#334155] leading-relaxed whitespace-pre-line">{report.description}</p>
                        </div>
                    </div>

                    {/* Review note */}
                    {report.review_note && (
                        <div className={`rounded-xl px-4 py-3 border ${report.status === "REVIEWED" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                            <p className={`text-[10px] font-bold uppercase tracking-wide mb-1 ${report.status === "REVIEWED" ? "text-emerald-600" : "text-amber-600"}`}>
                                💬 Catatan Reviewer
                                {report.reviewer && <span className="font-normal normal-case ml-1">— {report.reviewer.name}</span>}
                            </p>
                            <p className="text-sm text-[#334155] leading-relaxed">{report.review_note}</p>
                        </div>
                    )}

                    {/* Info waktu */}
                    <div className="text-[10px] text-[#94a3b8] space-y-0.5 pt-1">
                        <p>Dibuat: {new Date(report.created_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</p>
                        {report.reviewed_at && <p>Direview: {new Date(report.reviewed_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</p>}
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-[#f1f5f9] flex gap-2 flex-shrink-0 flex-wrap bg-white">
                    {canDel && (
                        <button onClick={onDelete}
                            className="h-10 px-4 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-bold hover:bg-red-100 transition-all active:scale-[0.98]">
                            🗑️ Hapus
                        </button>
                    )}
                    {canEdit && (
                        <button onClick={onEdit}
                            className="h-10 px-4 bg-[#f1f5f9] text-[#475569] border border-[#e2e8f0] rounded-xl text-xs font-bold hover:bg-[#e2e8f0] transition-all active:scale-[0.98]">
                            ✏️ Edit
                        </button>
                    )}
                    {canDoReview && (
                        <button onClick={onReview}
                            className="flex-1 h-10 text-white rounded-xl text-xs font-bold hover:opacity-90 transition-all active:scale-[0.98]"
                            style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 6px 18px -6px rgba(124,58,237,0.5)" }}>
                            🔍 Review Laporan
                        </button>
                    )}
                    {!canDoReview && !canEdit && (
                        <button onClick={onClose} className="flex-1 h-10 bg-[#f1f5f9] text-[#64748b] rounded-xl text-xs font-semibold hover:bg-[#e2e8f0] transition-all">
                            Tutup
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PKLReportsPage() {
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [reports, setReports] = useState<PKLReport[]>([]);
    const [pklUsers, setPKLUsers] = useState<PKLUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);

    function getDefaultDivision(role?: string): string {
        if (!role) return "ALL";
        const PKL_ROLE_DIVISION_MAP: Record<string, string> = {
            PKL_MARKETING: "MARKETING",
            PKL_SALES: "SALES",
            PKL_PENYEDIA_BARANG: "PENYEDIA_BARANG",
            PKL_TEKNISI: "TEKNISI",
            PKL_ONPOINT: "ONPOINT",
            PKL_SOTECH: "SOTECH",
            PKL_KONTEN: "MARKETING",
            KEPALA_MARKETING: "MARKETING",
            KEPALA_SALES: "SALES",
            KEPALA_PENYEDIA_BARANG: "PENYEDIA_BARANG",
            KEPALA_TEKNISI: "TEKNISI",
            KEPALA_ONPOINT: "ONPOINT",
            KEPALA_SOTECH: "SOTECH",
        };
        return PKL_ROLE_DIVISION_MAP[role] ?? "ALL";
    }

    const [activeDivision, setActiveDivision] = useState<string>("ALL");
    const [filterStatus, setFilterStatus] = useState<string>("ALL");
    const [filterPKL, setFilterPKL] = useState<string>("ALL");
    const [filterMonth, setFilterMonth] = useState<string>(() => getWIBToday().slice(0, 7));
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    // Modal states
    const [showForm, setShowForm] = useState(false);
    const [showReview, setShowReview] = useState(false);
    const [showDetail, setShowDetail] = useState(false);
    const [selectedReport, setSelectedReport] = useState<PKLReport | null>(null);
    const [editReport, setEditReport] = useState<PKLReport | null>(null);
    const [prefillDate, setPrefillDate] = useState<string | null>(null);
    const [filterDate, setFilterDate] = useState<string | null>(null);

    // ── Fetch ──────────────────────────────────────────────────────────────
    const fetchReports = useCallback(async () => {
        if (!currentUser) return;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (activeDivision !== "ALL") params.set("division", activeDivision);
            if (filterStatus !== "ALL") params.set("status", filterStatus);
            if (filterPKL !== "ALL") params.set("pkl_user_id", filterPKL);
            if (filterDate) {
                params.set("date_from", filterDate);
                params.set("date_to", filterDate);
            } else if (filterMonth) {
                params.set("date_from", `${filterMonth}-01`);
                const [y, m] = filterMonth.split("-").map(Number);
                const lastDay = new Date(y, m, 0).getDate();
                params.set("date_to", `${filterMonth}-${pad2(lastDay)}`);
            }
            const res = await fetch(`/api/pkl-reports?${params}`);
            const d = await res.json();
            if (d.success) { setReports(d.data || []); setTotalCount(d.count ?? 0); }
        } finally { setLoading(false); }
    }, [currentUser, activeDivision, filterStatus, filterPKL, filterMonth, filterDate]);

    const KEPALA_PKL_ROLE_MAP: Record<string, string> = {
        KEPALA_MARKETING: "PKL_MARKETING",
        KEPALA_SALES: "PKL_SALES",
        KEPALA_PENYEDIA_BARANG: "PKL_PENYEDIA_BARANG",
        KEPALA_TEKNISI: "PKL_TEKNISI",
        KEPALA_ONPOINT: "PKL_ONPOINT",
        KEPALA_SOTECH: "PKL_SOTECH",
    };

    const fetchPKLUsers = useCallback(async () => {
        const res = await fetch("/api/attendance/users");
        const d = await res.json();
        if (d.success) {
            const allPKL = (d.data || []).filter((u: PKLUser) =>
                u.role === "PKL" || u.role.startsWith("PKL_") || u.role.startsWith("PKL-")
            );
            if (isKepala(currentUser?.role)) {
                const allowedRole = KEPALA_PKL_ROLE_MAP[currentUser.role];
                setPKLUsers(allowedRole ? allPKL.filter((u: PKLUser) => u.role === allowedRole) : []);
            } else {
                setPKLUsers(allPKL);
            }
        }
    }, [currentUser?.role]);

    useEffect(() => {
        getCurrentUserClient().then(u => {
            setCurrentUser(u);
            if (u?.role) {
                const defaultDiv = getDefaultDivision(u.role);
                setActiveDivision(defaultDiv);
            }
        });
    }, []);

    useEffect(() => {
        if (!currentUser) return;
        fetchReports();
        if (isFullAccess(currentUser.role) || isKepala(currentUser.role)) fetchPKLUsers();
    }, [currentUser, fetchReports, fetchPKLUsers]);

    // ── Delete ─────────────────────────────────────────────────────────────
    const handleDelete = async (id: string) => {
        if (!confirm("Hapus laporan ini?")) return;
        const res = await fetch(`/api/pkl-reports?id=${id}`, { method: "DELETE" });
        const d = await res.json();
        if (d.success) { setShowDetail(false); fetchReports(); }
        else alert(d.message || "Gagal menghapus");
    };

    // ── Derived stats ──────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const submitted = reports.filter(r => r.status === "SUBMITTED").length;
        const reviewed = reports.filter(r => r.status === "REVIEWED").length;
        const revision = reports.filter(r => r.status === "REVISION").length;
        const uniquePKL = new Set(reports.map(r => r.user_id)).size;
        return { total: reports.length, submitted, reviewed, revision, uniquePKL };
    }, [reports]);

    // ── Group by PKL user (untuk tampilan ringkasan) ───────────────────────
    const reportsByPKL = useMemo(() => {
        const map: Record<string, PKLReport[]> = {};
        reports.forEach(r => {
            const uid = r.user_id;
            if (!map[uid]) map[uid] = [];
            map[uid].push(r);
        });
        return map;
    }, [reports]);

    // ── Access guard ───────────────────────────────────────────────────────
    if (currentUser && !canAccessPage(currentUser.role)) {
        return (
            <DashboardLayout>
                <div className="flex flex-col items-center justify-center min-h-[60vh]">
                    <div className="w-16 h-16 rounded-2xl bg-[#fff1f2] flex items-center justify-center mb-4">
                        <span className="text-3xl">🚫</span>
                    </div>
                    <p className="text-base font-bold text-[#334155]">Akses Ditolak</p>
                    <p className="text-sm text-[#94a3b8] mt-1">Halaman ini hanya untuk PKL dan pemantau divisi</p>
                </div>
            </DashboardLayout>
        );
    }

    const isPKLUser = isPKL(currentUser?.role);
    const isAdminUser = isFullAccess(currentUser?.role);
    const isKepalaUser = isKepala(currentUser?.role);
    const calendarMonth = filterMonth || getWIBToday().slice(0, 7);

    const activeFilterCount =
        (filterStatus !== "ALL" ? 1 : 0) +
        (filterPKL !== "ALL" ? 1 : 0) +
        (filterDate ? 1 : 0) +
        (!isPKLUser && !isKepalaUser && activeDivision !== "ALL" ? 1 : 0);

    return (
        <DashboardLayout>
            <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #F6F7FB 0%, #F7F7F8 320px)" }}>
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5 animate-fadeIn">

                    {/* ── Hero Header ── */}
                    <div className="relative overflow-hidden rounded-3xl px-5 sm:px-7 py-6 sm:py-7"
                        style={{ background: "linear-gradient(135deg, #0f0c29 0%, #1a1545 55%, #241a5c 100%)" }}>
                        {/* decorative glows */}
                        <div className="absolute -top-16 -right-8 w-64 h-64 rounded-full blur-3xl opacity-30 pointer-events-none"
                            style={{ background: "radial-gradient(circle, #7c3aed, transparent 70%)" }} />
                        <div className="absolute -bottom-24 left-8 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none"
                            style={{ background: "radial-gradient(circle, #3b82f6, transparent 70%)" }} />
                        {/* subtle grid texture */}
                        <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
                            style={{
                                backgroundImage:
                                    "linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)",
                                backgroundSize: "36px 36px",
                                maskImage: "radial-gradient(circle at 20% 0%, black, transparent 70%)",
                                WebkitMaskImage: "radial-gradient(circle at 20% 0%, black, transparent 70%)",
                            }} />

                        <div className="relative flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-3.5 min-w-0">
                                <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 bg-white/10 backdrop-blur-sm ring-1 ring-white/15">
                                    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 14l9-5-9-5-9 5 9 5z" />
                                        <path d="M5 11.5V17c0 1.5 3 3 7 3s7-1.5 7-3v-5.5" />
                                    </svg>
                                </div>
                                <div className="min-w-0">
                                    <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white truncate">
                                        Laporan Kerja PKL
                                    </h1>
                                    <p className="text-xs sm:text-[13px] text-white/55 mt-0.5">
                                        {isPKLUser
                                            ? "Buat dan pantau laporan kerja harianmu"
                                            : isKepalaUser
                                                ? `Pantau laporan kerja PKL divisi ${getDivisionInfo(activeDivision).label} · ${stats.uniquePKL} PKL aktif`
                                                : `Pantau laporan kerja ${stats.uniquePKL} PKL aktif`}
                                    </p>
                                </div>
                            </div>
                            {(isPKLUser || isAdminUser) && (
                                <button
                                    onClick={() => { setEditReport(null); setPrefillDate(null); setShowForm(true); }}
                                    className="flex items-center gap-1.5 text-xs font-bold text-[#1a1545] bg-white px-5 py-2.5 rounded-xl hover:bg-white/90 transition-all active:scale-[0.98] shadow-lg shadow-black/20"
                                >
                                    ➕ {isPKLUser ? "Buat Laporan" : "Tambah Manual"}
                                </button>
                            )}
                        </div>

                        {/* mini pills */}
                        <div className="relative flex flex-wrap items-center gap-2 mt-5">
                            {[
                                { l: "Terkirim", v: stats.submitted, c: DOT_COLOR.SUBMITTED },
                                { l: "Disetujui", v: stats.reviewed, c: DOT_COLOR.REVIEWED },
                                { l: "Revisi", v: stats.revision, c: DOT_COLOR.REVISION },
                            ].map(p => (
                                <span key={p.l}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 ring-1 ring-white/10 backdrop-blur-sm text-[11px] font-semibold text-white/75">
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.c }} />
                                    {p.l}
                                    <span className="font-black text-white tabular-nums">{p.v}</span>
                                </span>
                            ))}
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 ring-1 ring-white/10 backdrop-blur-sm text-[11px] font-semibold text-white/75">
                                🗓️ {MONTH_NAMES[parseInt(calendarMonth.split("-")[1]) - 1]} {calendarMonth.split("-")[0]}
                            </span>
                        </div>
                    </div>

                    {/* ── Stat Cards ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <StatCard icon="📋" value={stats.total} label="Total Laporan" loading={loading} gradient="linear-gradient(135deg, #94a3b8, #475569)" tint="#f1f5f9" />
                        <StatCard icon="📤" value={stats.submitted} label="Terkirim" loading={loading} gradient="linear-gradient(135deg, #60a5fa, #2563eb)" tint="#eff6ff" />
                        <StatCard icon="✅" value={stats.reviewed} label="Disetujui" loading={loading} gradient="linear-gradient(135deg, #34d399, #059669)" tint="#ecfdf5" />
                        <StatCard icon="🔄" value={stats.revision} label="Perlu Revisi" loading={loading} gradient="linear-gradient(135deg, #fbbf24, #d97706)" tint="#fffbeb" />
                    </div>

                    {/* ── Kalender + Insight ── */}
                    {(isPKLUser || isAdminUser || isKepalaUser) && (
                        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,460px)_1fr] gap-4 items-start">
                            <MiniCalendar
                                month={calendarMonth}
                                reports={reports}
                                isPKLUser={isPKLUser}
                                filterDate={filterDate}
                                onMonthChange={(mm) => { setFilterMonth(mm); setFilterDate(null); }}
                                onPickDate={(date, existing) => {
                                    if (isPKLUser) {
                                        if (existing) { setSelectedReport(existing); setShowDetail(true); }
                                        else { setPrefillDate(date); setEditReport(null); setShowForm(true); }
                                    } else {
                                        setFilterDate(prev => (prev === date ? null : date));
                                    }
                                }}
                            />
                            <MonthInsight
                                month={calendarMonth}
                                reports={reports}
                                isPKLUser={isPKLUser}
                                pklUsers={pklUsers}
                                onPickDate={(date) => { setPrefillDate(date); setEditReport(null); setShowForm(true); }}
                            />
                        </div>
                    )}

                    {/* ── Filter Bar ── */}
                    <div className="bg-white rounded-2xl overflow-hidden" style={CARD_STYLE}>

                        {/* Header strip — toggle di mobile */}
                        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5" style={SECTION_HEAD}>
                            <button
                                onClick={() => setShowMobileFilters(!showMobileFilters)}
                                className="sm:hidden flex items-center gap-2 text-sm font-bold text-[#334155]"
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                                </svg>
                                Filter & Pencarian
                                {activeFilterCount > 0 && (
                                    <span className="text-[9px] font-black text-white bg-[#1a1545] rounded-full w-4 h-4 flex items-center justify-center tabular-nums">
                                        {activeFilterCount}
                                    </span>
                                )}
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                    className={`transition-transform duration-300 ${showMobileFilters ? "rotate-180" : ""}`}>
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </button>
                            <div className="hidden sm:flex items-center gap-2 text-sm font-bold text-[#334155]">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                                </svg>
                                Filter & Pencarian
                                {activeFilterCount > 0 && (
                                    <span className="text-[9px] font-black text-white bg-[#1a1545] rounded-full w-4 h-4 flex items-center justify-center tabular-nums">
                                        {activeFilterCount}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className={`px-5 sm:px-6 py-5 space-y-4 ${showMobileFilters ? "block" : "hidden sm:block"}`}>

                            {/* Filter divisi — chip scrollable */}
                            {!isPKLUser && !isKepalaUser && (
                                <div>
                                    <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-2">Filter Divisi</p>
                                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                        <button
                                            onClick={() => setActiveDivision("ALL")}
                                            className="px-4 py-2 rounded-xl text-xs font-bold transition-all border flex-shrink-0 active:scale-[0.97]"
                                            style={activeDivision === "ALL"
                                                ? { background: NAVY_GRADIENT, color: "#fff", borderColor: "transparent", boxShadow: NAVY_SHADOW }
                                                : { background: "#fff", color: "#64748b", borderColor: "#e2e8f0" }}
                                        >
                                            🌐 Semua Divisi
                                        </button>
                                        {DIVISIONS.map(div => (
                                            <button
                                                key={div.id}
                                                onClick={() => setActiveDivision(div.id)}
                                                className="px-4 py-2 rounded-xl text-xs font-bold transition-all border flex-shrink-0 active:scale-[0.97]"
                                                style={activeDivision === div.id
                                                    ? { background: NAVY_GRADIENT, color: "#fff", borderColor: "transparent", boxShadow: NAVY_SHADOW }
                                                    : { background: "#fff", color: "#64748b", borderColor: "#e2e8f0" }}
                                            >
                                                {div.emoji} {div.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Info divisi untuk kepala — read only */}
                            {isKepalaUser && activeDivision !== "ALL" && (() => {
                                const div = getDivisionInfo(activeDivision);
                                return (
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border ${div.color}`}>
                                            {div.emoji} Divisi {div.label}
                                        </span>
                                        <span className="text-[10px] text-[#94a3b8]">Kamu hanya dapat melihat laporan PKL divisimu</span>
                                    </div>
                                );
                            })()}

                            {/* Row filter lainnya */}
                            <div className="flex flex-wrap gap-3">
                                {/* Bulan */}
                                <div>
                                    <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-1">Bulan</p>
                                    <input
                                        type="month"
                                        value={filterMonth}
                                        onChange={e => { setFilterMonth(e.target.value); setFilterDate(null); }}
                                        className="h-10 border border-[#e8ecf5] rounded-xl px-3 text-sm bg-[#f7f9ff] text-[#334155] focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:bg-white transition-all"
                                    />
                                </div>

                                {/* Status */}
                                <div>
                                    <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-1">Status</p>
                                    <select
                                        value={filterStatus}
                                        onChange={e => setFilterStatus(e.target.value)}
                                        className="h-10 border border-[#e8ecf5] rounded-xl px-3 text-sm bg-[#f7f9ff] text-[#334155] focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:bg-white transition-all min-w-[140px]"
                                    >
                                        <option value="ALL">Semua Status</option>
                                        <option value="SUBMITTED">📤 Terkirim</option>
                                        <option value="REVIEWED">✅ Disetujui</option>
                                        <option value="REVISION">🔄 Perlu Revisi</option>
                                    </select>
                                </div>

                                {/* Filter PKL — admin/kepala */}
                                {!isPKLUser && pklUsers.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-1">PKL</p>
                                        <select
                                            value={filterPKL}
                                            onChange={e => setFilterPKL(e.target.value)}
                                            className="h-10 border border-[#e8ecf5] rounded-xl px-3 text-sm bg-[#f7f9ff] text-[#334155] focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:bg-white transition-all min-w-[160px]"
                                        >
                                            <option value="ALL">Semua PKL</option>
                                            {pklUsers.map(u => (
                                                <option key={u.id} value={u.id}>{u.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Refresh */}
                                <div className="flex items-end">
                                    <button onClick={fetchReports}
                                        className="h-10 px-4 bg-white border border-[#e8ecf5] text-[#64748b] rounded-xl text-xs font-semibold hover:bg-[#f8fafc] hover:text-[#1a1545] transition-all flex items-center gap-1.5 active:scale-[0.97]">
                                        <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        Refresh
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── PKL Summary Cards (untuk admin/kepala lihat per PKL) ── */}
                    {!isPKLUser && Object.keys(reportsByPKL).length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <p className="text-sm font-bold text-[#475569]">📊 Ringkasan per PKL</p>
                                <span className="text-[10px] font-bold text-[#94a3b8] bg-white border border-[#eef0f6] px-2 py-0.5 rounded-full tabular-nums">
                                    {Object.keys(reportsByPKL).length} orang
                                </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {Object.entries(reportsByPKL).map(([uid, rpts]) => {
                                    const pklName = rpts[0]?.users?.name ?? "—";
                                    const pklRole = rpts[0]?.users?.role ?? "PKL";
                                    const reviewed = rpts.filter(r => r.status === "REVIEWED").length;
                                    const submitted = rpts.filter(r => r.status === "SUBMITTED").length;
                                    const revision = rpts.filter(r => r.status === "REVISION").length;
                                    const pct = rpts.length > 0 ? Math.round((reviewed / rpts.length) * 100) : 0;
                                    const divCounts: Record<string, number> = {};
                                    rpts.forEach(r => { divCounts[r.division] = (divCounts[r.division] ?? 0) + 1; });
                                    const topDiv = Object.entries(divCounts).sort((a, b) => b[1] - a[1])[0];

                                    return (
                                        <div key={uid} className="group bg-white rounded-2xl p-4 transition-all duration-300 hover:-translate-y-0.5"
                                            style={CARD_STYLE}>
                                            <div className="flex items-center gap-3 mb-3.5">
                                                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 ring-2 ring-white shadow-sm"
                                                    style={{ background: "linear-gradient(135deg, #fbbf24, #b45309)" }}>
                                                    {initials(pklName)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-[#0f172a] text-sm truncate">{pklName}</p>
                                                    <p className="text-[10px] text-[#b45309] font-semibold truncate">{pklRole.replace(/_/g, " ")}</p>
                                                </div>
                                                <span className="ml-auto text-[10px] font-black text-[#94a3b8] tabular-nums bg-[#f8fafc] border border-[#eef0f6] px-2 py-0.5 rounded-lg flex-shrink-0">
                                                    {rpts.length}
                                                </span>
                                            </div>

                                            {/* Stats */}
                                            <div className="grid grid-cols-3 gap-2 mb-3.5">
                                                <div className="bg-blue-50 border border-blue-100 rounded-xl p-2 text-center">
                                                    <p className="text-lg font-black text-blue-600 tabular-nums">{submitted}</p>
                                                    <p className="text-[9px] text-[#94a3b8] font-semibold">Terkirim</p>
                                                </div>
                                                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2 text-center">
                                                    <p className="text-lg font-black text-emerald-600 tabular-nums">{reviewed}</p>
                                                    <p className="text-[9px] text-[#94a3b8] font-semibold">Disetujui</p>
                                                </div>
                                                <div className="bg-amber-50 border border-amber-100 rounded-xl p-2 text-center">
                                                    <p className="text-lg font-black text-amber-600 tabular-nums">{revision}</p>
                                                    <p className="text-[9px] text-[#94a3b8] font-semibold">Revisi</p>
                                                </div>
                                            </div>

                                            {/* Progress bar */}
                                            <div className="mb-2">
                                                <div className="flex items-center justify-between mb-1">
                                                    <p className="text-[10px] text-[#64748b] font-medium">Tingkat persetujuan</p>
                                                    <p className={`text-[10px] font-black tabular-nums ${pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-500"}`}>{pct}%</p>
                                                </div>
                                                <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-700 ${pct >= 80 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                            </div>

                                            {topDiv && (
                                                <p className="text-[10px] text-[#94a3b8]">
                                                    Divisi utama: <span className="font-bold text-[#475569]">{getDivisionInfo(topDiv[0]).emoji} {getDivisionInfo(topDiv[0]).label}</span>
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Daftar Laporan ── */}
                    <div className="bg-white rounded-2xl overflow-hidden" style={CARD_STYLE}>
                        <div className="px-5 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3" style={SECTION_HEAD}>
                            <div>
                                <p className="text-base font-bold text-[#0f172a]">
                                    {isPKLUser ? "Laporan Kerjamu" : "Semua Laporan"}
                                </p>
                                <p className="text-[10px] text-[#94a3b8] mt-0.5">
                                    {filterDate
                                        ? `📌 ${formatDate(filterDate)}`
                                        : filterMonth
                                            ? `${MONTH_NAMES[parseInt(filterMonth.split("-")[1]) - 1]} ${filterMonth.split("-")[0]}`
                                            : "Semua bulan"}
                                    {" · "}{totalCount} laporan
                                    {filterDate && (
                                        <button onClick={() => setFilterDate(null)} className="ml-2 text-[#6d28d9] hover:text-[#4c1d95] font-bold">
                                            (reset)
                                        </button>
                                    )}
                                </p>
                            </div>

                            {/* Shortcut tambah laporan — PKL */}
                            {isPKLUser && (
                                <button
                                    onClick={() => { setPrefillDate(getWIBToday()); setEditReport(null); setShowForm(true); }}
                                    className="flex items-center gap-1.5 text-xs font-bold text-[#1a1545] bg-white border border-[#e2e8f0] px-4 py-2 rounded-xl hover:bg-[#f1f5f9] transition-all active:scale-[0.97]"
                                >
                                    ✏️ Laporan Hari Ini
                                </button>
                            )}
                        </div>

                        {loading ? (
                            <div className="p-5 sm:p-6 space-y-3">
                                {Array(4).fill(0).map((_, i) => (
                                    <div key={i} className="h-20 bg-[#f5f7ff] rounded-2xl animate-pulse" />
                                ))}
                            </div>
                        ) : reports.length === 0 ? (
                            <div className="py-16 text-center px-4">
                                <div className="w-14 h-14 rounded-2xl bg-[#f5f7ff] flex items-center justify-center mx-auto mb-4">
                                    <span className="text-3xl opacity-40">📋</span>
                                </div>
                                <p className="text-sm text-[#475569] font-bold">Belum ada laporan di rentang ini</p>
                                <p className="text-xs text-[#94a3b8] mt-1">Ubah filter bulan/status, atau buat laporan baru.</p>
                                {isPKLUser && (
                                    <button
                                        onClick={() => { setEditReport(null); setShowForm(true); }}
                                        className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-white px-5 py-2.5 rounded-xl transition-all active:scale-[0.98]"
                                        style={{ background: NAVY_GRADIENT, boxShadow: NAVY_SHADOW }}
                                    >
                                        ➕ Buat laporan
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="divide-y" style={{ borderColor: "#f5f5fb" }}>
                                {reports.map(report => {
                                    const div = getDivisionInfo(report.division);
                                    const status = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.SUBMITTED;
                                    const isToday = report.report_date === getWIBToday();

                                    return (
                                        <div
                                            key={report.id}
                                            role="button"
                                            tabIndex={0}
                                            className="relative px-5 sm:px-6 py-4 border-l-[3px] hover:bg-[#fafbff] transition-colors cursor-pointer group focus:outline-none focus-visible:bg-[#f5f7ff]"
                                            style={{ borderLeftColor: DOT_COLOR[report.status] ?? "transparent" }}
                                            onClick={() => { setSelectedReport(report); setShowDetail(true); }}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    setSelectedReport(report); setShowDetail(true);
                                                }
                                            }}
                                        >
                                            <div className="flex items-start gap-3 sm:gap-4">
                                                {/* Avatar */}
                                                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 mt-0.5 ring-2 ring-white shadow-sm"
                                                    style={{ background: "linear-gradient(135deg, #fbbf24, #b45309)" }}>
                                                    {initials(report.users?.name ?? "?")}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                                        {!isPKLUser && (
                                                            <p className="text-sm font-bold text-[#0f172a]">{report.users?.name ?? "—"}</p>
                                                        )}
                                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${div.color}`}>
                                                            {div.emoji} {div.label}
                                                        </span>
                                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.bg} ${status.color} ${status.border}`}>
                                                            {status.emoji} {status.label}
                                                        </span>
                                                        {isToday && (
                                                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                                                                Hari ini
                                                            </span>
                                                        )}
                                                    </div>

                                                    <p className="text-xs text-[#94a3b8] mb-1">{formatDate(report.report_date)}</p>

                                                    {report.title && (
                                                        <p className="text-sm font-semibold text-[#334155] truncate mb-0.5">{report.title}</p>
                                                    )}
                                                    <p className="text-xs text-[#64748b] line-clamp-2 leading-relaxed">
                                                        {report.description}
                                                    </p>

                                                    {/* Review note preview */}
                                                    {report.review_note && (
                                                        <div className={`mt-2 text-[11px] px-3 py-1.5 rounded-lg flex items-start gap-1.5 ${report.status === "REVIEWED"
                                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                            : "bg-amber-50 text-amber-700 border border-amber-200"
                                                            }`}>
                                                            <span className="flex-shrink-0">💬</span>
                                                            <span className="line-clamp-1">{report.review_note}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Chevron */}
                                                <svg className="w-4 h-4 text-[#cbd5e1] group-hover:text-[#64748b] group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                </div>
            </div>

            {/* ── Modals ── */}
            {showForm && (
                <ReportFormModal
                    currentUser={currentUser}
                    editData={editReport}
                    prefillDate={prefillDate}
                    prefillDivision={activeDivision !== "ALL" ? activeDivision : undefined}
                    allPKLUsers={isAdminUser ? pklUsers : undefined}
                    onClose={() => { setShowForm(false); setEditReport(null); setPrefillDate(null); }}
                    onSaved={() => { fetchReports(); setShowForm(false); setEditReport(null); setPrefillDate(null); }}
                />
            )}

            {showDetail && selectedReport && (
                <ReportDetailModal
                    report={selectedReport}
                    currentUser={currentUser}
                    onClose={() => { setShowDetail(false); setSelectedReport(null); }}
                    onEdit={() => { setEditReport(selectedReport); setShowDetail(false); setShowForm(true); }}
                    onReview={() => { setShowDetail(false); setShowReview(true); }}
                    onDelete={() => handleDelete(selectedReport.id)}
                />
            )}

            {showReview && selectedReport && (
                <ReviewModal
                    report={selectedReport}
                    currentUser={currentUser}
                    onClose={() => { setShowReview(false); setSelectedReport(null); }}
                    onSaved={() => { fetchReports(); setShowReview(false); setSelectedReport(null); }}
                />
            )}

            <style jsx global>{`
                @keyframes fadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
                @keyframes scaleIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
                .animate-fadeIn { animation: fadeIn 0.4s cubic-bezier(0.16,1,0.3,1); }
                .animate-scaleIn { animation: scaleIn 0.3s cubic-bezier(0.16,1,0.3,1); }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
                @media (prefers-reduced-motion: reduce) {
                    .animate-fadeIn, .animate-scaleIn { animation: none; }
                }
            `}</style>
        </DashboardLayout>
    );
}