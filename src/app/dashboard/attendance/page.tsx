// src/app/dashboard/attendance/page.tsx
"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";
import DashboardLayout from "@/components/layout/DashboardLayout";

type Attendance = {
    id: string;
    user_name: string;
    user_role: string;
    date: string;
    check_in_time: string;
    status: "PRESENT" | "LATE" | string;
    method: "FACE" | "FORCE" | string;
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    device: string;
    ip_address: string;
    face_distance: number | null;
    created_at: string;
    displayStatus?: "PRESENT" | "LATE";
};

const OFFICE_LAT = -6.402593;
const OFFICE_LNG = 106.787233;
const ATTENDANCE_END_HOUR = 12;
const ATTENDANCE_END_MIN = 0;

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toWIBTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("id-ID", {
        hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
    });
}

function isLate(checkInTime: string): boolean {
    const date = new Date(checkInTime);
    const wibMs = date.getTime() + 7 * 60 * 60 * 1000;
    const wibDate = new Date(wibMs);
    const totalMinutes = wibDate.getUTCHours() * 60 + wibDate.getUTCMinutes();
    return totalMinutes > ATTENDANCE_END_HOUR * 60 + ATTENDANCE_END_MIN;
}

function getDisplayStatus(a: Attendance): "PRESENT" | "LATE" {
    if (a.status === "LATE") return "LATE";
    if (isLate(a.check_in_time || a.created_at)) return "LATE";
    return "PRESENT";
}

function toWIBDateKey(iso: string): string {
    const d = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
}

const MONTH_NAMES = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const Shimmer = ({ className = "" }: { className?: string }) => (
    <div className={`rounded-lg animate-pulse bg-gray-100 ${className}`} />
);

function LocationBadge({ lat, lng, accuracy }: {
    lat: number | null; lng: number | null; accuracy: number | null;
}) {
    if (!lat || !lng) return <span className="text-[10px] text-gray-300">—</span>;
    const distanceM = Math.round(haversine(lat, lng, OFFICE_LAT, OFFICE_LNG));
    const isNear = distanceM <= 80;
    return (
        <div className="flex flex-col gap-1">
            <div className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit ${isNear ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}`}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {distanceM}m
            </div>
            <a href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-blue-500 hover:underline">
                {lat.toFixed(4)}, {lng.toFixed(4)}
            </a>
        </div>
    );
}

// ── Month/Year Picker Dropdown ────────────────────────────────────────────────
function MonthYearPicker({
    year, month,
    onChange, onClose,
}: {
    year: number; month: number;
    onChange: (y: number, m: number) => void;
    onClose: () => void;
}) {
    const [pickerYear, setPickerYear] = useState(year);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [onClose]);

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

    return (
        <div
            ref={ref}
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 w-72"
            style={{ minWidth: 280 }}
        >
            {/* Navigasi tahun */}
            <div className="flex items-center justify-between mb-3">
                <button
                    onClick={() => setPickerYear(y => y - 1)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <div className="flex gap-1">
                    {years.map(y => (
                        <button
                            key={y}
                            onClick={() => setPickerYear(y)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${pickerYear === y
                                ? "bg-[#1a1a2e] text-white"
                                : "text-gray-500 hover:bg-gray-100"
                            }`}
                        >
                            {y}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => setPickerYear(y => y + 1)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>

            {/* Grid bulan */}
            <div className="grid grid-cols-4 gap-1.5">
                {MONTH_SHORT.map((m, idx) => {
                    const isActive = pickerYear === year && idx === month;
                    const isCurrentMonth = pickerYear === currentYear && idx === new Date().getMonth();
                    return (
                        <button
                            key={m}
                            onClick={() => { onChange(pickerYear, idx); onClose(); }}
                            className={`h-9 rounded-xl text-xs font-medium transition-all ${
                                isActive
                                    ? "bg-[#1a1a2e] text-white shadow-sm"
                                    : isCurrentMonth
                                    ? "bg-blue-50 text-blue-600 border border-blue-200"
                                    : "text-gray-600 hover:bg-gray-100"
                            }`}
                        >
                            {m}
                        </button>
                    );
                })}
            </div>

            {/* Tombol kembali ke bulan ini */}
            <button
                onClick={() => {
                    const now = new Date();
                    onChange(now.getFullYear(), now.getMonth());
                    onClose();
                }}
                className="w-full mt-3 h-8 text-xs font-medium text-gray-500 bg-gray-50 rounded-xl hover:bg-gray-100 transition"
            >
                Kembali ke bulan ini
            </button>
        </div>
    );
}

export default function AttendanceDashboardPage() {
    const [attendances, setAttendances] = useState<Attendance[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [filterUser, setFilterUser] = useState("Semua");
    const [searchTerm, setSearchTerm] = useState("");
    const [showPicker, setShowPicker] = useState(false);

    const today = new Date();
    const [calYear, setCalYear] = useState(today.getFullYear());
    const [calMonth, setCalMonth] = useState(today.getMonth());

    useEffect(() => {
        const init = async () => {
            const user = await getCurrentUserClient();
            setCurrentUser(user);
            fetchAttendance();
        };
        init();
    }, []);

    const fetchAttendance = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/attendance");
            const result = await res.json();
            if (result.success) {
                setAttendances((result.data || []).map((a: Attendance) => ({
                    ...a,
                    displayStatus: getDisplayStatus(a),
                })));
            }
        } catch { } finally {
            setLoading(false);
        }
    };

    const filteredByUser = useMemo(() => {
        return attendances.filter(a => {
            if (filterUser !== "Semua" && a.user_name !== filterUser) return false;
            if (searchTerm && !a.user_name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            return true;
        });
    }, [attendances, filterUser, searchTerm]);

    const byDate = useMemo(() => {
        const map: Record<string, Attendance[]> = {};
        filteredByUser.forEach(a => {
            const key = toWIBDateKey(a.check_in_time || a.created_at);
            if (!map[key]) map[key] = [];
            map[key].push(a);
        });
        return map;
    }, [filteredByUser]);

    const selectedAttendances = useMemo(() => {
        if (!selectedDate) return [];
        return (byDate[selectedDate] || []).sort((a, b) =>
            new Date(a.check_in_time).getTime() - new Date(b.check_in_time).getTime()
        );
    }, [selectedDate, byDate]);

    const uniqueUsers = useMemo(() => {
        const users = [...new Set(attendances.map(a => a.user_name))].sort();
        return ["Semua", ...users];
    }, [attendances]);

    const thisMonthKey = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;
    const thisMonthAttendances = filteredByUser.filter(a =>
        toWIBDateKey(a.check_in_time || a.created_at).startsWith(thisMonthKey)
    );
    const thisMonthPresent = thisMonthAttendances.filter(a => a.displayStatus === "PRESENT").length;
    const thisMonthLate = thisMonthAttendances.filter(a => a.displayStatus === "LATE").length;
    const thisMonthDays = new Set(
        thisMonthAttendances.map(a => toWIBDateKey(a.check_in_time || a.created_at))
    ).size;

    // Kehadiran per user bulan ini
    const userSummary = useMemo(() => {
        const map: Record<string, { present: number; late: number; name: string }> = {};
        thisMonthAttendances.forEach(a => {
            if (!map[a.user_name]) map[a.user_name] = { present: 0, late: 0, name: a.user_name };
            if (a.displayStatus === "PRESENT") map[a.user_name].present++;
            else map[a.user_name].late++;
        });
        return Object.values(map).sort((a, b) => (b.present + b.late) - (a.present + a.late));
    }, [thisMonthAttendances]);

    const calDays = useMemo(() => {
        const firstDay = new Date(calYear, calMonth, 1).getDay();
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
        const cells: (number | null)[] = [];
        for (let i = 0; i < firstDay; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        return cells;
    }, [calYear, calMonth]);

    const todayKey = toWIBDateKey(new Date().toISOString());

    const prevMonth = () => {
        if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
        else setCalMonth(m => m - 1);
        setSelectedDate(null);
    };
    const nextMonth = () => {
        if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
        else setCalMonth(m => m + 1);
        setSelectedDate(null);
    };
    const handleDayClick = (day: number) => {
        const key = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        setSelectedDate(prev => prev === key ? null : key);
    };

    // Semua kehadiran di bulan ini per hari (untuk strip bawah kalender)
    const workdaysInMonth = useMemo(() => {
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
        const workdays: number[] = [];
        for (let d = 1; d <= daysInMonth; d++) {
            const dow = new Date(calYear, calMonth, d).getDay();
            if (dow !== 0) workdays.push(d); // exclude Sunday
        }
        return workdays;
    }, [calYear, calMonth]);

    return (
        <DashboardLayout>
            <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

                {/* ── Header ── */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                            {currentUser?.role === "ADMIN" ? "Laporan Absensi Karyawan" : "Riwayat Absensi Saya"}
                        </h1>
                        <p className="text-xs text-gray-400 mt-0.5">{MONTH_NAMES[calMonth]} {calYear}</p>
                    </div>
                    <button
                        onClick={fetchAttendance}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-xl transition bg-white"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh
                    </button>
                </div>

                {/* ── Stat Cards ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { label: "Hari Hadir", value: thisMonthDays, icon: "📅", color: "text-gray-800", border: "border-gray-100" },
                        { label: "Tepat Waktu", value: thisMonthPresent, icon: "✅", color: "text-emerald-700", border: "border-emerald-100" },
                        { label: "Terlambat", value: thisMonthLate, icon: "⏰", color: "text-amber-700", border: "border-amber-100" },
                        { label: "Karyawan", value: uniqueUsers.length - 1, icon: "👥", color: "text-gray-800", border: "border-gray-100" },
                    ].map(card => (
                        <div key={card.label} className={`bg-white rounded-2xl border ${card.border} shadow-sm p-4`}>
                            <div className="flex items-start justify-between">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{card.label}</p>
                                <span className="text-base opacity-60">{card.icon}</span>
                            </div>
                            <p className={`text-2xl font-bold mt-1.5 ${card.color}`}>
                                {loading ? <Shimmer className="w-10 h-7 inline-block" /> : card.value}
                            </p>
                            <p className="text-[10px] text-gray-300 mt-0.5">bulan ini</p>
                        </div>
                    ))}
                </div>

                {/* ── Filter (ADMIN only) ── */}
                {currentUser?.role === "ADMIN" && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2.5">
                        <div className="flex flex-wrap gap-1.5">
                            {uniqueUsers.map(name => (
                                <button
                                    key={name}
                                    onClick={() => setFilterUser(name)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filterUser === name
                                        ? "bg-[#1a1a2e] text-white"
                                        : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                                    }`}
                                >
                                    {name}
                                </button>
                            ))}
                        </div>
                        <input
                            type="text"
                            placeholder="Cari nama karyawan..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full sm:w-64 h-9 border border-gray-200 rounded-xl px-3 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition"
                        />
                    </div>
                )}

                {/* ── Main Content: Kalender + Panel kanan ── */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

                    {/* Kalender */}
                    <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-visible">

                        {/* Navigasi bulan dengan picker */}
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                            <button onClick={prevMonth}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>

                            {/* ── Tombol bulan/tahun yang bisa diklik untuk picker ── */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowPicker(p => !p)}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition group"
                                >
                                    <span className="text-sm font-semibold text-gray-800 group-hover:text-[#1a1a2e]">
                                        {MONTH_NAMES[calMonth]} {calYear}
                                    </span>
                                    <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showPicker ? "rotate-180" : ""}`}
                                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {showPicker && (
                                    <MonthYearPicker
                                        year={calYear}
                                        month={calMonth}
                                        onChange={(y, m) => {
                                            setCalYear(y);
                                            setCalMonth(m);
                                            setSelectedDate(null);
                                        }}
                                        onClose={() => setShowPicker(false)}
                                    />
                                )}
                            </div>

                            <button onClick={nextMonth}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-4">
                            {/* Header hari */}
                            <div className="grid grid-cols-7 mb-2">
                                {DAY_NAMES.map((d, i) => (
                                    <div key={d} className={`text-center text-[10px] font-semibold uppercase py-1 ${i === 0 ? "text-red-400" : "text-gray-400"}`}>
                                        {d}
                                    </div>
                                ))}
                            </div>

                            {/* Grid tanggal */}
                            {loading ? (
                                <div className="grid grid-cols-7 gap-1">
                                    {Array(35).fill(0).map((_, i) => (
                                        <div key={i} className="h-14 rounded-xl bg-gray-50 animate-pulse" />
                                    ))}
                                </div>
                            ) : (
                                <div className="grid grid-cols-7 gap-1">
                                    {calDays.map((day, idx) => {
                                        if (day === null) return <div key={`empty-${idx}`} />;

                                        const dateKey = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                                        const dayData = byDate[dateKey] || [];
                                        const presentCount = dayData.filter(a => a.displayStatus === "PRESENT").length;
                                        const lateCount = dayData.filter(a => a.displayStatus === "LATE").length;
                                        const total = dayData.length;
                                        const isToday = dateKey === todayKey;
                                        const isSelected = dateKey === selectedDate;
                                        const dow = new Date(calYear, calMonth, day).getDay();
                                        const isSunday = dow === 0;
                                        const isSaturday = dow === 6;
                                        const hasData = total > 0;

                                        return (
                                            <button
                                                key={day}
                                                onClick={() => handleDayClick(day)}
                                                className={`
                                                    relative flex flex-col items-center pt-1.5 pb-1 px-0.5 rounded-xl min-h-[58px] transition-all
                                                    ${isSelected
                                                        ? "bg-[#1a1a2e] shadow-md ring-2 ring-[#1a1a2e]/30"
                                                        : isToday
                                                        ? "bg-blue-50 ring-1 ring-blue-200"
                                                        : hasData
                                                        ? "bg-gray-50 hover:bg-gray-100"
                                                        : "hover:bg-gray-50"
                                                    }
                                                `}
                                            >
                                                {/* Nomor tanggal */}
                                                <span className={`text-xs font-bold mb-1 ${
                                                    isSelected ? "text-white"
                                                    : isToday ? "text-blue-600"
                                                    : isSunday ? "text-red-400"
                                                    : isSaturday ? "text-gray-400"
                                                    : "text-gray-700"
                                                }`}>
                                                    {day}
                                                </span>

                                                {/* Dot/bar indikator */}
                                                {hasData && (
                                                    <div className="flex flex-col items-center gap-0.5 w-full px-1">
                                                        {/* Bar presentase tepat waktu */}
                                                        {presentCount > 0 && (
                                                            <div className={`w-full h-1 rounded-full ${isSelected ? "bg-emerald-300" : "bg-emerald-400"}`} />
                                                        )}
                                                        {/* Bar terlambat */}
                                                        {lateCount > 0 && (
                                                            <div className={`w-full h-1 rounded-full ${isSelected ? "bg-amber-300" : "bg-amber-400"}`} />
                                                        )}
                                                    </div>
                                                )}

                                                {/* Jumlah */}
                                                {total > 0 && (
                                                    <span className={`text-[9px] font-bold mt-0.5 ${isSelected ? "text-white/70" : "text-gray-400"}`}>
                                                        {total}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Legenda */}
                            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-100 flex-wrap">
                                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                                    <span className="w-4 h-1 rounded-full bg-emerald-400 inline-block" />
                                    Tepat waktu
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                                    <span className="w-4 h-1 rounded-full bg-amber-400 inline-block" />
                                    Terlambat
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                                    <span className="w-4 h-3.5 rounded-md bg-blue-50 border border-blue-200 inline-block" />
                                    Hari ini
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-gray-400 ml-auto">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    angka = total absensi
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Panel Kanan ── */}
                    <div className="lg:col-span-2 flex flex-col gap-4">

                        {/* Detail tanggal terpilih */}
                        {selectedDate ? (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-800">
                                            {new Date(selectedDate + "T12:00:00+07:00").toLocaleDateString("id-ID", {
                                                weekday: "long", day: "numeric", month: "long",
                                            })}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                {selectedAttendances.filter(a => a.displayStatus === "PRESENT").length} tepat
                                            </span>
                                            {selectedAttendances.filter(a => a.displayStatus === "LATE").length > 0 && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                    {selectedAttendances.filter(a => a.displayStatus === "LATE").length} terlambat
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedDate(null)}
                                        className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 transition"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>

                                {selectedAttendances.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10">
                                        <div className="text-3xl mb-2 opacity-40">📅</div>
                                        <p className="text-sm text-gray-400">Tidak ada absensi hari ini</p>
                                    </div>
                                ) : (
                                    <div className="overflow-y-auto max-h-[360px] lg:max-h-[420px] divide-y divide-gray-50">
                                        {selectedAttendances.map(a => (
                                            <div key={a.id} className="px-4 py-3 hover:bg-gray-50/50 transition">
                                                <div className="flex items-start gap-3">
                                                    {/* Avatar */}
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${a.displayStatus === "PRESENT" ? "bg-[#1a1a2e]" : "bg-amber-500"}`}>
                                                        {a.user_name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className="text-sm font-semibold text-gray-800 truncate">{a.user_name}</p>
                                                            <span className="font-mono text-sm font-bold text-gray-700 flex-shrink-0">
                                                                {toWIBTime(a.check_in_time || a.created_at)}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                            <span className="text-[10px] text-gray-400">{a.user_role?.replace(/_/g, " ")}</span>
                                                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                                                                a.displayStatus === "PRESENT"
                                                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                                            }`}>
                                                                {a.displayStatus === "PRESENT" ? "Tepat" : "Terlambat"}
                                                            </span>
                                                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                                                                a.method === "FACE"
                                                                    ? "bg-blue-50 text-blue-600 border-blue-200"
                                                                    : "bg-gray-100 text-gray-500 border-gray-200"
                                                            }`}>
                                                                {a.method === "FACE" ? "Wajah" : "Manual"}
                                                            </span>
                                                        </div>
                                                        <div className="mt-1.5">
                                                            <LocationBadge lat={a.latitude} lng={a.longitude} accuracy={a.accuracy} />
                                                        </div>
                                                        {a.device && (
                                                            <p className="text-[10px] text-gray-300 mt-1 truncate">{a.device}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Empty state dengan hint */
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-12 px-6 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-4">
                                    <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <p className="text-sm font-medium text-gray-600">Pilih tanggal di kalender</p>
                                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                                    Klik tanggal untuk melihat<br />detail absensi hari itu
                                </p>
            {/* Hint tanggal dengan data */}
                                {Object.keys(byDate).filter(k => k.startsWith(thisMonthKey)).length > 0 && (
                                    <div className="mt-4 w-full">
                                        <p className="text-[10px] text-gray-400 mb-2">Tanggal dengan data bulan ini:</p>
                                        <div className="flex flex-wrap gap-1 justify-center">
                                            {Object.keys(byDate)
                                                .filter(k => k.startsWith(thisMonthKey))
                                                .sort()
                                                .slice(0, 10)
                                                .map(k => (
                                                    <button
                                                        key={k}
                                                        onClick={() => setSelectedDate(k)}
                                                        className="text-[10px] font-mono px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg hover:bg-[#1a1a2e] hover:text-white hover:border-[#1a1a2e] transition"
                                                    >
                                                        {k.slice(8)}
                                                    </button>
                                                ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Ringkasan per karyawan bulan ini — hanya ADMIN */}
                        {currentUser?.role === "ADMIN" && userSummary.length > 0 && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="px-4 py-3 border-b border-gray-100">
                                    <p className="text-xs font-semibold text-gray-700">Ringkasan {MONTH_NAMES[calMonth]}</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Total per karyawan</p>
                                </div>
                                <div className="divide-y divide-gray-50 max-h-[280px] overflow-y-auto">
                                    {userSummary.map(u => {
                                        const total = u.present + u.late;
                                        const presentPct = total > 0 ? Math.round((u.present / total) * 100) : 0;
                                        return (
                                            <div key={u.name} className="px-4 py-2.5 hover:bg-gray-50/50 transition">
                                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className="w-6 h-6 rounded-full bg-[#1a1a2e] flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                                                            {u.name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                                                        </div>
                                                        <span className="text-xs font-medium text-gray-700 truncate">{u.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                                        <span className="text-[10px] text-emerald-600 font-semibold">{u.present}✓</span>
                                                        {u.late > 0 && <span className="text-[10px] text-amber-600 font-semibold">{u.late}⏰</span>}
                                                    </div>
                                                </div>
                                                {/* Progress bar */}
                                                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-emerald-400 transition-all"
                                                        style={{ width: `${presentPct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </DashboardLayout>
    );
}