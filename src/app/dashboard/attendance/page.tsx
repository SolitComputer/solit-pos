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

const METHOD_STYLES: Record<string, string> = {
    FACE: "bg-blue-50 text-blue-700 border-blue-200",
    FORCE: "bg-orange-50 text-orange-700 border-orange-200",
};
const STATUS_STYLES: Record<string, string> = {
    PRESENT: "bg-emerald-50 text-emerald-700 border-emerald-200",
    LATE: "bg-amber-50 text-amber-700 border-amber-200",
};

// ─── Location Badge ────────────────────────────────────────────────────────────
// ✅ Fitur baru: tampilkan jarak + link maps + koordinat
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
            {/* Jarak dari kantor */}
            <div className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit
        ${isNear ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}`}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {distanceM}m dari kantor
            </div>

            {/* Koordinat + buka maps */}
            <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 transition w-fit"
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

// ─── Shimmer ──────────────────────────────────────────────────────────────────
const Shimmer = ({ className = "" }: { className?: string }) => (
    <div className={`rounded-lg animate-pulse bg-gray-100 ${className}`} />
);

// ─── Main Page ────────────────────────────────────────────────────────────────
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

            const now = new Date();
            const hours = now.getHours();
            const minutes = now.getMinutes();
            const isAttendanceHour = (hours === 7 && minutes >= 30) || (hours >= 8 && hours < 12);

            if (isAttendanceHour) {
                const hasAttended = document.cookie.includes("face_attended") ||
                    document.cookie.includes("face_verified");
                if (!hasAttended) {
                    window.location.href = "/face-verify?from=/dashboard/attendance";
                    return;
                }
            }

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

    // ── Filter ────────────────────────────────────────────────────────────────
    const filteredData = useMemo(() => {
        let data = [...attendances];

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
    }, [attendances, activeTab, searchTerm, dateFilter]);

    const uniqueUsers = useMemo(() => {
        const users = [...new Set(attendances.map(a => a.user_name))];
        return ["Semua", ...users];
    }, [attendances]);

    // ── Stats hitung dari tabel attendances ───────────────────────────────────
    const todayCount = attendances.filter(a => {
        const d = new Date(a.check_in_time || a.created_at);
        return d.toDateString() === new Date().toDateString();
    }).length;

    const presentCount = attendances.filter(a => a.status === "PRESENT").length;
    const lateCount = attendances.filter(a => a.status === "LATE").length;

    return (
        <DashboardLayout>
            <div className="space-y-5 max-w-6xl">

                {/* ── Header ── */}
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
                            {currentUser?.role === "ADMIN" ? "Laporan Absensi Karyawan" : "Riwayat Absensi Saya"}
                        </h1>
                        <p className="text-xs text-gray-400 mt-0.5">
                            Total tercatat: <span className="font-semibold text-gray-600">{attendances.length}</span> absensi
                        </p>
                    </div>
                    <button
                        onClick={fetchAttendance}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-xl transition"
                    >
                        ↻ Refresh
                    </button>
                </div>

                {/* ── Stat Cards ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                    {[
                        { label: "Hari Ini", value: todayCount, color: "text-gray-800", bg: "bg-gray-50", border: "border-gray-200" },
                        { label: "Tepat Waktu", value: presentCount, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
                        { label: "Terlambat", value: lateCount, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
                        { label: "Karyawan", value: uniqueUsers.length - 1, color: "text-gray-800", bg: "bg-gray-50", border: "border-gray-200" },
                    ].map(card => (
                        <div key={card.label} className={`${card.bg} border ${card.border} rounded-2xl p-4 shadow-sm`}>
                            <p className="text-gray-500 text-xs font-medium">{card.label}</p>
                            <p className={`text-3xl font-extrabold mt-1 ${card.color}`}>
                                {loading ? <Shimmer className="w-10 h-7 mt-1" /> : card.value}
                            </p>
                        </div>
                    ))}
                </div>

                {/* ── Filters ── */}
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 sm:p-4 space-y-3">
                    {/* Tabs user */}
                    <div className="flex flex-wrap gap-1.5">
                        {uniqueUsers.map(name => (
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
                        ))}
                    </div>

                    {/* Date + Search */}
                    <div className="flex flex-wrap gap-2">
                        <select
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value as any)}
                            className="bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
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
                            className="bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs flex-1 min-w-[150px] text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                        />
                    </div>
                </div>

                {/* ── Table desktop / Card mobile ── */}

                {/* Desktop table */}
                <div className="hidden sm:block bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[700px]">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50">
                                    {["Tanggal", "Nama", "Jam Masuk", "Status", "Metode", "Lokasi", "Device"].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[11px] text-gray-500 font-semibold uppercase tracking-wide">
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
                                            <p className="text-2xl mb-2">📋</p>
                                            <p className="text-gray-400 text-sm">Tidak ada data absensi</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredData.map(a => (
                                        <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition">
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
                                                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[a.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                                    {a.status === "PRESENT" ? "Tepat Waktu" : a.status === "LATE" ? "Terlambat" : a.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${METHOD_STYLES[a.method] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                                    {a.method === "FACE" ? "Wajah" : a.method === "FORCE" ? "Manual" : a.method}
                                                </span>
                                            </td>
                                            {/* ✅ Kolom lokasi baru */}
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
                            <p className="text-2xl mb-2">📋</p>
                            <p className="text-gray-400 text-sm">Tidak ada data absensi</p>
                        </div>
                    ) : (
                        filteredData.map(a => {
                            const distM = (a.latitude && a.longitude)
                                ? Math.round(haversine(a.latitude, a.longitude, OFFICE_LAT, OFFICE_LNG))
                                : null;

                            return (
                                <div key={a.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                                    {/* Baris 1: Nama + jam */}
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

                                    {/* Baris 2: badge status + metode */}
                                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[a.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                            {a.status === "PRESENT" ? "Tepat Waktu" : a.status === "LATE" ? "Terlambat" : a.status}
                                        </span>
                                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${METHOD_STYLES[a.method] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                            {a.method === "FACE" ? "Wajah" : a.method === "FORCE" ? "Manual" : a.method}
                                        </span>
                                    </div>

                                    {/* ✅ Baris 3: Lokasi */}
                                    <div className="mt-2.5 pt-2.5 border-t border-gray-50">
                                        <LocationBadge lat={a.latitude} lng={a.longitude} accuracy={a.accuracy} />
                                    </div>

                                    {/* Device */}
                                    <div className="mt-1.5 text-[10px] text-gray-300 truncate">{a.device}</div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Count info */}
                {!loading && filteredData.length > 0 && (
                    <p className="text-xs text-gray-400 text-center pb-2">
                        Menampilkan {filteredData.length} dari {attendances.length} data
                    </p>
                )}

            </div>
        </DashboardLayout>
    );
}