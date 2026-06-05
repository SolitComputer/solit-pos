// src/app/dashboard/attendance/page.tsx

"use client";

import { useEffect, useState, useMemo } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";
import DashboardLayout from "@/components/layout/DashboardLayout";

// ─── Types ────────────────────────────────────────────────────────────────────
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
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const OFFICE_LAT = -6.402593;
const OFFICE_LNG = 106.787233;

// ✅ Konstanta jam absen
const ATTENDANCE_START_HOUR = 7;
const ATTENDANCE_START_MIN = 30;
const ATTENDANCE_END_HOUR = 12;
const ATTENDANCE_END_MIN = 0;

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toWIBTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("id-ID", {
        hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
    });
}

function toWIBDate(iso: string): string {
    return new Date(iso).toLocaleDateString("id-ID", {
        weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Jakarta",
    });
}

function isLateAttendance(checkInTime: string): boolean {
    const date = new Date(checkInTime);
    // Konversi ke WIB (UTC+7)
    const wibMs = date.getTime() + 7 * 60 * 60 * 1000;
    const wibDate = new Date(wibMs);
    const totalMinutes = wibDate.getUTCHours() * 60 + wibDate.getUTCMinutes();
    const endTimeMinutes = ATTENDANCE_END_HOUR * 60 + ATTENDANCE_END_MIN;

    // Jika absen setelah jam 12:00 WIB → TERLAMBAT
    return totalMinutes > endTimeMinutes;
}

// ✅ FUNGSI BARU: Mendapatkan status yang benar untuk ditampilkan
function getDisplayStatus(attendance: Attendance): "PRESENT" | "LATE" {
    // Jika status asli sudah LATE, tetap LATE
    if (attendance.status === "LATE") return "LATE";

    // Jika status asli PRESENT, cek apakah absen setelah jam 12:00
    const checkTime = attendance.check_in_time || attendance.created_at;
    if (isLateAttendance(checkTime)) {
        return "LATE"; // Tampilkan sebagai TERLAMBAT
    }

    return "PRESENT"; // Tepat waktu
}

const METHOD_STYLES: Record<string, string> = {
    FACE: "bg-gray-100 text-gray-700 border-gray-200",
    FORCE: "bg-gray-100 text-gray-700 border-gray-200",
};

const STATUS_STYLES: Record<string, string> = {
    PRESENT: "bg-gray-100 text-gray-700 border-gray-200",
    LATE: "bg-amber-50 text-amber-700 border-amber-200",
};

function LocationBadge({ lat, lng, accuracy }: {
    lat: number | null; lng: number | null; accuracy: number | null;
}) {
    if (!lat || !lng) {
        return <span className="text-[10px] text-gray-300">—</span>;
    }

    const distanceM = Math.round(haversine(lat, lng, OFFICE_LAT, OFFICE_LNG));
    const isNear = distanceM <= 80;
    const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

    return (
        <div className="flex flex-col gap-1">
            <div className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit
        ${isNear ? "bg-gray-100 text-gray-700 border-gray-200" : "bg-red-50 text-red-600 border-red-200"}`}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {distanceM}m dari kantor
            </div>
            <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700 transition w-fit"
            >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                {lat.toFixed(5)}, {lng.toFixed(5)}
                {accuracy != null && <span className="text-gray-300 ml-0.5">±{Math.round(accuracy)}m</span>}
            </a>
        </div>
    );
}

const Shimmer = ({ className = "" }: { className?: string }) => (
    <div className={`rounded-lg animate-pulse bg-gray-100 ${className}`} />
);

export default function AttendanceDashboardPage() {
    const [attendances, setAttendances] = useState<Attendance[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<string>("Semua");
    const [searchTerm, setSearchTerm] = useState("");
    const [dateFilter, setDateFilter] = useState<"today" | "yesterday" | "week" | "month" | "all">("today");

    useEffect(() => {
        const init = async () => {
            const user = await getCurrentUserClient();
            setCurrentUser(user);
            fetchAttendance();
        };
        init();
    }, []);

    const fetchAttendance = async () => {
        try {
            const res = await fetch("/api/attendance");
            const result = await res.json();
            if (result.success) {
                setAttendances(result.data || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // ✅ Data dengan status yang sudah dikoreksi (untuk ditampilkan)
    const attendancesWithCorrectedStatus = useMemo(() => {
        return attendances.map(att => ({
            ...att,
            displayStatus: getDisplayStatus(att)
        }));
    }, [attendances]);

    // ── Filter ────────────────────────────────────────────────────────────────
    const filteredData = useMemo(() => {
        let data = [...attendancesWithCorrectedStatus];

        if (activeTab !== "Semua") {
            data = data.filter(item => item.user_name === activeTab);
        }
        if (searchTerm) {
            data = data.filter(item =>
                item.user_name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        data = data.filter(item => {
            const itemDate = new Date(item.check_in_time || item.created_at);
            const itemDay = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());

            if (dateFilter === "today") return itemDay.getTime() === today.getTime();
            if (dateFilter === "yesterday") {
                const y = new Date(today); y.setDate(y.getDate() - 1);
                return itemDay.getTime() === y.getTime();
            }
            if (dateFilter === "week") {
                const w = new Date(today); w.setDate(w.getDate() - 7);
                return itemDay >= w;
            }
            if (dateFilter === "month") {
                return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
            }
            return true;
        });

        return data.sort((a, b) =>
            new Date(b.check_in_time || b.created_at).getTime() -
            new Date(a.check_in_time || a.created_at).getTime()
        );
    }, [attendancesWithCorrectedStatus, activeTab, searchTerm, dateFilter]);

    const uniqueUsers = useMemo(() => {
        const users = [...new Set(attendancesWithCorrectedStatus.map(a => a.user_name))];
        return ["Semua", ...users];
    }, [attendancesWithCorrectedStatus]);

    // ✅ Statistik menggunakan status yang sudah dikoreksi
    const todayCount = attendancesWithCorrectedStatus.filter(a => {
        const d = new Date(a.check_in_time || a.created_at);
        return d.toDateString() === new Date().toDateString();
    }).length;

    const presentCount = attendancesWithCorrectedStatus.filter(a => a.displayStatus === "PRESENT").length;
    const lateCount = attendancesWithCorrectedStatus.filter(a => a.displayStatus === "LATE").length;

    return (
        <DashboardLayout>
            <div className="space-y-5 max-w-6xl mx-auto px-4 py-6">

                {/* ── Header ── */}
                <div className="flex flex-wrap items-end justify-between gap-3 animate-fadeIn">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-1 h-7 bg-gradient-to-b from-gray-600 to-gray-800 rounded-full" />
                            <div className="w-7 h-7 bg-gradient-to-br from-gray-600 to-gray-800 rounded-lg flex items-center justify-center shadow-md">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <polyline points="12 6 12 12 16 14" />
                                </svg>
                            </div>
                            <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-900 bg-clip-text text-transparent">
                                {currentUser?.role === "ADMIN" ? "Laporan Absensi Karyawan" : "Riwayat Absensi Saya"}
                            </h1>
                        </div>
                        <p className="text-sm text-gray-500 ml-10">
                            Total tercatat: <span className="font-semibold text-gray-700">{attendancesWithCorrectedStatus.length}</span> absensi
                        </p>
                    </div>
                    <button
                        onClick={fetchAttendance}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-xl transition-all duration-200 hover:bg-gray-50"
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
                        { label: "Hari Ini", value: todayCount, icon: "📅" },
                        { label: "Tepat Waktu", value: presentCount, icon: "✅" },
                        { label: "Terlambat", value: lateCount, icon: "⏰" },
                        { label: "Karyawan", value: uniqueUsers.length - 1, icon: "👥" },
                    ].map(card => (
                        <div key={card.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-all duration-300">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">{card.label}</p>
                                    <p className="text-2xl font-extrabold mt-1 text-gray-800">
                                        {loading ? <Shimmer className="w-10 h-7" /> : card.value}
                                    </p>
                                </div>
                                <div className="text-xl opacity-60">{card.icon}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Filters ── */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                        {uniqueUsers.map(name => (
                            <button
                                key={name}
                                onClick={() => setActiveTab(name)}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 ${
                                    activeTab === name
                                        ? "bg-gray-700 text-white shadow-md"
                                        : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
                                }`}
                            >
                                {name}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <select
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value as any)}
                            className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 transition-all duration-200 cursor-pointer"
                        >
                            <option value="today">Hari Ini</option>
                            <option value="yesterday">Kemarin</option>
                            <option value="week">7 Hari Terakhir</option>
                            <option value="month">Bulan Ini</option>
                            <option value="all">Semua Tanggal</option>
                        </select>
                        <input
                            type="text"
                            placeholder="Cari nama..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs flex-1 min-w-[150px] text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 transition-all duration-200"
                        />
                    </div>
                </div>

                {/* ── Table desktop ── */}
                <div className="hidden sm:block bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[700px]">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50">
                                    {["Tanggal", "Nama", "Jam Masuk", "Status", "Metode", "Lokasi", "Device"].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[11px] text-gray-400 font-semibold uppercase tracking-wider">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    [1, 2, 3, 4].map(i => (
                                        <tr key={i} className="border-b border-gray-50">
                                            {[1, 2, 3, 4, 5, 6, 7].map(j => (
                                                <td key={j} className="px-4 py-3.5">
                                                    <Shimmer className="h-4 w-full max-w-[120px]" />
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                ) : filteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-14 text-center">
                                            <p className="text-5xl mb-3">📋</p>
                                            <p className="text-gray-400 text-sm">Tidak ada data absensi</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredData.map((a, idx) => (
                                        <tr key={a.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-all duration-200 ${
                                            idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                                        }`}>
                                            <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                                                {toWIBDate(a.check_in_time || a.created_at)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-semibold text-gray-800 text-sm">{a.user_name}</div>
                                                <div className="text-[10px] text-gray-400">{a.user_role?.replace(/_/g, " ")}</div>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-sm text-gray-700 whitespace-nowrap">
                                                {toWIBTime(a.check_in_time || a.created_at)}
                                                <span className="text-gray-300 text-[10px] ml-1">WIB</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[a.displayStatus] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                                    {a.displayStatus === "PRESENT" ? "Tepat Waktu" : "Terlambat"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${METHOD_STYLES[a.method] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                                    {a.method === "FACE" ? "Wajah" : a.method === "FORCE" ? "Manual" : a.method}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <LocationBadge lat={a.latitude} lng={a.longitude} accuracy={a.accuracy} />
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-400 max-w-[160px] truncate">
                                                {a.device}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Mobile cards */}
                <div className="sm:hidden space-y-2">
                    {loading ? (
                        [1, 2, 3].map(i => (
                            <div key={i} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-2">
                                <Shimmer className="w-32 h-4" />
                                <Shimmer className="w-full h-3" />
                                <Shimmer className="w-24 h-3" />
                            </div>
                        ))
                    ) : filteredData.length === 0 ? (
                        <div className="py-14 text-center bg-white border border-gray-100 rounded-2xl">
                            <p className="text-5xl mb-3">📋</p>
                            <p className="text-gray-400 text-sm">Tidak ada data absensi</p>
                        </div>
                    ) : (
                        filteredData.map(a => {
                            return (
                                <div key={a.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="font-semibold text-gray-800 text-sm">{a.user_name}</div>
                                            <div className="text-[10px] text-gray-400 mt-0.5">{a.user_role?.replace(/_/g, " ")}</div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <div className="font-mono text-sm font-bold text-gray-800">
                                                {toWIBTime(a.check_in_time || a.created_at)}
                                                <span className="text-gray-300 text-[10px] ml-0.5">WIB</span>
                                            </div>
                                            <div className="text-[10px] text-gray-400 mt-0.5">
                                                {toWIBDate(a.check_in_time || a.created_at)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[a.displayStatus] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                            {a.displayStatus === "PRESENT" ? "Tepat Waktu" : "Terlambat"}
                                        </span>
                                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${METHOD_STYLES[a.method] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                            {a.method === "FACE" ? "Wajah" : a.method === "FORCE" ? "Manual" : a.method}
                                        </span>
                                    </div>

                                    <div className="mt-2.5 pt-2.5 border-t border-gray-50">
                                        <LocationBadge lat={a.latitude} lng={a.longitude} accuracy={a.accuracy} />
                                    </div>

                                    <div className="mt-1.5 text-[10px] text-gray-300 truncate">{a.device}</div>
                                </div>
                            );
                        })
                    )}
                </div>

                {!loading && filteredData.length > 0 && (
                    <p className="text-xs text-gray-400 text-center pb-2">
                        Menampilkan {filteredData.length} dari {attendancesWithCorrectedStatus.length} data
                    </p>
                )}

            </div>

            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeIn { animation: fadeIn 0.4s ease-out; }
            `}</style>
        </DashboardLayout>
    );
}