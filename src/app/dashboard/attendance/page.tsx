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
    const wibMs = date.getTime() + 7 * 60 * 60 * 1000;
    const wibDate = new Date(wibMs);
    const totalMinutes = wibDate.getUTCHours() * 60 + wibDate.getUTCMinutes();
    const endTimeMinutes = ATTENDANCE_END_HOUR * 60 + ATTENDANCE_END_MIN;

    // Jika absen setelah jam 12:00 WIB → TERLAMBAT
    return totalMinutes > endTimeMinutes;
}

function getDisplayStatus(attendance: Attendance): "PRESENT" | "LATE" {
    if (attendance.status === "LATE") return "LATE";

    // Jika status asli PRESENT, cek apakah absen setelah jam 12:00
    const checkTime = attendance.check_in_time || attendance.created_at;
    if (isLateAttendance(checkTime)) {
        return "LATE"; // Tampilkan sebagai TERLAMBAT
    }

    return "PRESENT"; // Tepat waktu
}

const METHOD_STYLES: Record<string, string> = {
    FACE: "bg-blue-50 text-blue-700 border-blue-200",
    FORCE: "bg-orange-50 text-orange-700 border-orange-200",
};

const STATUS_STYLES: Record<string, string> = {
    PRESENT: "bg-emerald-50 text-emerald-700 border-emerald-200",
    LATE: "bg-amber-50 text-amber-700 border-amber-200",
};

function LocationBadge({ lat, lng, accuracy }: {
    lat: number | null; lng: number | null; accuracy: number | null;
}) {
    const [showMap, setShowMap] = useState(false);

    if (!lat || !lng) {
        return <span className="text-[10px] text-gray-300">—</span>;
    }

    const distanceM = Math.round(haversine(lat, lng, OFFICE_LAT, OFFICE_LNG));
    const isNear = distanceM <= 80;
    const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

    return (
        <div className="relative">
            <div className="flex items-center gap-2">
                <div className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full border cursor-pointer transition-all hover:scale-105
                    ${isNear ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}`}
                    onMouseEnter={() => setShowMap(true)}
                    onMouseLeave={() => setShowMap(false)}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {distanceM}m dari kantor
                </div>
                
                {showMap && (
                    <div className="absolute bottom-full left-0 mb-2 z-10 bg-white rounded-lg shadow-xl border border-gray-200 p-2 w-64 animate-fadeIn">
                        <iframe
                            width="100%"
                            height="150"
                            frameBorder="0"
                            style={{ border: 0, borderRadius: '8px' }}
                            src={`https://maps.google.com/maps?q=${lat},${lng}&z=18&output=embed`}
                            title="Location Map"
                        />
                        <div className="text-[9px] text-gray-400 mt-1 text-center">
                            {lat.toFixed(5)}, {lng.toFixed(5)} ±{Math.round(accuracy || 0)}m
                        </div>
                    </div>
                )}
            </div>
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
    const [showFilters, setShowFilters] = useState(false);

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

    const attendancesWithCorrectedStatus = useMemo(() => {
        return attendances.map(att => ({
            ...att,
            displayStatus: getDisplayStatus(att)
        }));
    }, [attendances]);

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

    const todayCount = attendancesWithCorrectedStatus.filter(a => {
        const d = new Date(a.check_in_time || a.created_at);
        return d.toDateString() === new Date().toDateString();
    }).length;

    const presentCount = attendancesWithCorrectedStatus.filter(a => a.displayStatus === "PRESENT").length;
    const lateCount = attendancesWithCorrectedStatus.filter(a => a.displayStatus === "LATE").length;

    const handleExport = async () => {
        // Simulasi export - bisa diintegrasikan dengan API export
        console.log("Exporting data...", filteredData);
        alert("Fitur export akan segera hadir!");
    };

    return (
        <DashboardLayout>
            <div className="space-y-5 max-w-7xl mx-auto">

                {/* ── Header dengan animasi ── */}
                <div className="flex flex-wrap items-end justify-between gap-3 animate-fadeIn">
                    <div>
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-8 bg-gradient-to-b from-gray-700 to-gray-900 rounded-full" />
                            <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
                                {currentUser?.role === "ADMIN" ? "Laporan Absensi Karyawan" : "Riwayat Absensi Saya"}
                            </h1>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 ml-3">
                            Total tercatat: <span className="font-semibold text-gray-600">{attendancesWithCorrectedStatus.length}</span> absensi
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={fetchAttendance}
                            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-xl transition-all duration-200 hover:shadow-sm"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                        </button>
                        <ExportButton data={filteredData} onExport={handleExport} />
                    </div>
                </div>

                {/* ── Stat Cards dengan icon ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard 
                        label="HARI INI" 
                        value={todayCount} 
                        icon={<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>}
                        color="text-gray-800" bg="bg-gray-50" border="border-gray-200" loading={loading} 
                    />
                    <StatCard 
                        label="TEPAT WAKTU" 
                        value={presentCount} 
                        icon={<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                        color="text-emerald-700" bg="bg-emerald-50" border="border-emerald-200" loading={loading} 
                    />
                    <StatCard 
                        label="TERLAMBAT" 
                        value={lateCount} 
                        icon={<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                        color="text-amber-700" bg="bg-amber-50" border="border-amber-200" loading={loading} 
                    />
                    <StatCard 
                        label="KARYAWAN" 
                        value={uniqueUsers.length - 1} 
                        icon={<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>}
                        color="text-gray-800" bg="bg-gray-50" border="border-gray-200" loading={loading} 
                    />
                </div>

                {/* ── Filters dengan toggle ── */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <polygon points="22 3 2 3 10 13 10 21 14 18 14 13 22 3" />
                                </svg>
                                <span className="text-sm font-semibold text-gray-700">Filter Data</span>
                            </div>
                            <button
                                key={name}
                                onClick={() => setActiveTab(name)}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${activeTab === name
                                    ? "bg-gray-800 text-white shadow-sm"
                                    : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-100"
                                    }`}
                            >
                                {name}
                            </button>
                        </div>

                        <div className={`transition-all duration-300 overflow-hidden ${showFilters ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                            <div className="space-y-3 pt-2">
                                <div className="flex flex-wrap gap-2">
                                    {uniqueUsers.map(name => (
                                        <FilterBadge
                                            key={name}
                                            label={name}
                                            active={activeTab === name}
                                            onClick={() => setActiveTab(name)}
                                        />
                                    ))}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <select
                                        value={dateFilter}
                                        onChange={(e) => setDateFilter(e.target.value as any)}
                                        className="bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all"
                                    >
                                        <option value="today">📅 Hari Ini</option>
                                        <option value="yesterday">📆 Kemarin</option>
                                        <option value="week">📊 7 Hari Terakhir</option>
                                        <option value="month">🗓️ Bulan Ini</option>
                                        <option value="all">🌍 Semua Tanggal</option>
                                    </select>
                                    <div className="relative flex-1 min-w-[150px]">
                                        <input
                                            type="text"
                                            placeholder="Cari nama karyawan..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 pl-8 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all"
                                        />
                                        <svg className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Table desktop yang ditingkatkan ── */}
                <div className="hidden sm:block bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[700px]">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                                    {["Tanggal", "Nama", "Jam Masuk", "Status", "Metode", "Lokasi", "Device"].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[11px] text-gray-500 font-semibold uppercase tracking-wider">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={7}><LoadingSkeleton /></td></tr>
                                ) : filteredData.length === 0 ? (
                                    <tr><td colSpan={7}><EmptyState /></td></tr>
                                ) : (
                                    filteredData.map((a, idx) => (
                                        <tr key={a.id} className={`border-b border-gray-50 hover:bg-gray-50/60 transition-all duration-150 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                            <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap font-medium">
                                                {toWIBDate(a.check_in_time || a.created_at)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-semibold text-gray-800 text-sm">{a.user_name}</div>
                                                <div className="text-[10px] text-gray-400 mt-0.5">{a.user_role?.replace(/_/g, " ")}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-mono text-sm font-bold text-gray-800">
                                                    {toWIBTime(a.check_in_time || a.created_at)}
                                                </div>
                                                <div className="text-[9px] text-gray-300">WIB</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[a.displayStatus] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full ${a.displayStatus === "PRESENT" ? "bg-emerald-500" : "bg-amber-500"} animate-pulse`} />
                                                    {a.displayStatus === "PRESENT" ? "Tepat Waktu" : "Terlambat"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-semibold border ${METHOD_STYLES[a.method] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                                    {a.method === "FACE" ? "🎭 Wajah" : a.method === "FORCE" ? "✍️ Manual" : a.method}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <LocationBadge lat={a.latitude} lng={a.longitude} accuracy={a.accuracy} />
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1 text-xs text-gray-400">
                                                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <rect x="2" y="3" width="20" height="14" rx="2" />
                                                        <line x1="8" y1="21" x2="16" y2="21" />
                                                        <line x1="12" y1="17" x2="12" y2="21" />
                                                    </svg>
                                                    <span className="truncate max-w-[120px]">{a.device}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Mobile cards yang ditingkatkan */}
                <div className="sm:hidden space-y-3">
                    {loading ? (
                        <LoadingSkeleton />
                    ) : filteredData.length === 0 ? (
                        <EmptyState />
                    ) : (
                        filteredData.map(a => (
                            <div key={a.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300 transform hover:scale-[1.02]">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
                                                {a.user_name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="font-semibold text-gray-800 text-sm">{a.user_name}</div>
                                                <div className="text-[10px] text-gray-400">{a.user_role?.replace(/_/g, " ")}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <div className="font-mono text-base font-bold text-gray-800">
                                            {toWIBTime(a.check_in_time || a.created_at)}
                                        </div>
                                        <div className="text-[10px] text-gray-400 mt-0.5">
                                            {toWIBDate(a.check_in_time || a.created_at)}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2 mt-3">
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[a.displayStatus] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${a.displayStatus === "PRESENT" ? "bg-emerald-500" : "bg-amber-500"}`} />
                                        {a.displayStatus === "PRESENT" ? "Tepat Waktu" : "Terlambat"}
                                    </span>
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${METHOD_STYLES[a.method] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                        {a.method === "FACE" ? "🎭" : a.method === "FORCE" ? "✍️" : "📱"} 
                                        {a.method === "FACE" ? "Wajah" : a.method === "FORCE" ? "Manual" : a.method}
                                    </span>
                                </div>

                                <div className="mt-3 pt-3 border-t border-gray-50">
                                    <LocationBadge lat={a.latitude} lng={a.longitude} accuracy={a.accuracy} />
                                </div>

                                <div className="mt-2 flex items-center gap-1 text-[10px] text-gray-300">
                                    <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <rect x="2" y="3" width="20" height="14" rx="2" />
                                        <line x1="8" y1="21" x2="16" y2="21" />
                                        <line x1="12" y1="17" x2="12" y2="21" />
                                    </svg>
                                    <span className="truncate">{a.device}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Info footer */}
                {!loading && filteredData.length > 0 && (
                    <div className="flex items-center justify-between text-xs text-gray-400 pb-2">
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-1 bg-gray-300 rounded-full" />
                            <span>Menampilkan {filteredData.length} dari {attendancesWithCorrectedStatus.length} data</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span>Updated: {new Date().toLocaleTimeString("id-ID")}</span>
                        </div>
                    </div>
                )}

            </div>

            <style jsx>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-fadeIn {
                    animation: fadeIn 0.5s ease-out;
                }
            `}</style>
        </DashboardLayout>
    );
}