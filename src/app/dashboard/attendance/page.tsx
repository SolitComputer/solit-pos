// src/app/dashboard/attendance/page.tsx
"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";
import DashboardLayout from "@/components/layout/DashboardLayout";

// ─── Types ────────────────────────────────────────────────────────────────────
type Attendance = {
    id: string; user_name: string; user_role: string; date: string;
    check_in_time: string; status: "PRESENT" | "LATE" | string;
    method: "FACE" | "FORCE" | string; latitude: number | null;
    longitude: number | null; accuracy: number | null; device: string;
    ip_address: string; face_distance: number | null; created_at: string;
    displayStatus?: "PRESENT" | "LATE";
};

type DayOff = {
    id: string; user_id: string; day_of_week: number; notes?: string;
    users?: { id: string; name: string; role: string };
};

type DateOff = {
    id: string; user_id: string; off_date: string; notes?: string;
    users?: { id: string; name: string; role: string };
};

type UserInfo = { id: string; name: string; role: string };

// ─── Constants ────────────────────────────────────────────────────────────────
const OFFICE_LAT = -6.402593;
const OFFICE_LNG = 106.787233;
const ATTENDANCE_END_HOUR = 12;
const ATTENDANCE_END_MIN = 0;

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const DAY_FULL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180, dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function toWIBTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}
function isLate(t: string): boolean {
    const d = new Date(new Date(t).getTime() + 7 * 60 * 60 * 1000);
    return d.getUTCHours() * 60 + d.getUTCMinutes() > ATTENDANCE_END_HOUR * 60 + ATTENDANCE_END_MIN;
}
function getDisplayStatus(a: Attendance): "PRESENT" | "LATE" {
    if (a.status === "LATE") return "LATE";
    if (isLate(a.check_in_time || a.created_at)) return "LATE";
    return "PRESENT";
}
function toWIBDateKey(iso: string): string {
    return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ─── Shimmer ──────────────────────────────────────────────────────────────────
const Shimmer = ({ className = "" }: { className?: string }) => (
    <div className={`rounded-lg animate-pulse bg-gray-100 ${className}`} />
);

// ─── LocationBadge ────────────────────────────────────────────────────────────
function LocationBadge({ lat, lng, accuracy }: { lat: number | null; lng: number | null; accuracy: number | null }) {
    if (!lat || !lng) return <span className="text-[10px] text-gray-300">—</span>;
    const d = Math.round(haversine(lat, lng, OFFICE_LAT, OFFICE_LNG));
    return (
        <div className="flex flex-col gap-0.5">
            <div className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit ${d <= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}`}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {d}m
            </div>
            <a href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline">
                {lat.toFixed(4)}, {lng.toFixed(4)}
            </a>
        </div>
    );
}

// ─── MonthYearPicker ──────────────────────────────────────────────────────────
function MonthYearPicker({ year, month, onChange, onClose }: {
    year: number; month: number; onChange: (y: number, m: number) => void; onClose: () => void;
}) {
    const [py, setPy] = useState(year);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [onClose]);
    const cy = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => cy - 2 + i);
    return (
        <div ref={ref} className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 w-72">
            <div className="flex items-center justify-between mb-3">
                <button onClick={() => setPy(y => y - 1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="flex gap-1 flex-wrap justify-center">
                    {years.map(y => (
                        <button key={y} onClick={() => setPy(y)} className={`px-2 py-1 rounded-lg text-xs font-semibold transition ${py === y ? "bg-[#1a1a2e] text-white" : "text-gray-500 hover:bg-gray-100"}`}>{y}</button>
                    ))}
                </div>
                <button onClick={() => setPy(y => y + 1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
                {MONTH_SHORT.map((m, idx) => {
                    const active = py === year && idx === month;
                    const curr = py === cy && idx === new Date().getMonth();
                    return (
                        <button key={m} onClick={() => { onChange(py, idx); onClose(); }}
                            className={`h-9 rounded-xl text-xs font-medium transition-all ${active ? "bg-[#1a1a2e] text-white shadow-sm" : curr ? "bg-blue-50 text-blue-600 border border-blue-200" : "text-gray-600 hover:bg-gray-100"}`}>
                            {m}
                        </button>
                    );
                })}
            </div>
            <button onClick={() => { const n = new Date(); onChange(n.getFullYear(), n.getMonth()); onClose(); }}
                className="w-full mt-3 h-8 text-xs font-medium text-gray-500 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
                Kembali ke bulan ini
            </button>
        </div>
    );
}

// ─── DayOffModal — libur mingguan berulang ────────────────────────────────────
function DayOffModal({ users, dayOffs, onClose, onSaved }: {
    users: UserInfo[]; dayOffs: DayOff[]; onClose: () => void; onSaved: () => void;
}) {
    const [saving, setSaving] = useState(false);
    const [filter, setFilter] = useState("");
    const [error, setError] = useState("");

    const origMap = useMemo(() => {
        const m: Record<string, Set<number>> = {};
        dayOffs.forEach(d => { if (!m[d.user_id]) m[d.user_id] = new Set(); m[d.user_id].add(d.day_of_week); });
        return m;
    }, [dayOffs]);

    const [local, setLocal] = useState<Record<string, Set<number>>>(() => {
        const m: Record<string, Set<number>> = {};
        dayOffs.forEach(d => { if (!m[d.user_id]) m[d.user_id] = new Set(); m[d.user_id].add(d.day_of_week); });
        return m;
    });

    const toggle = (uid: string, dow: number) => {
        setLocal(prev => {
            const n = { ...prev };
            if (!n[uid]) n[uid] = new Set();
            const s = new Set(n[uid]);
            s.has(dow) ? s.delete(dow) : s.add(dow);
            n[uid] = s; return n;
        });
    };

    const save = async () => {
        setSaving(true); setError("");
        try {
            const ops: Promise<any>[] = [];
            users.forEach(u => {
                const orig = origMap[u.id] || new Set<number>();
                const cur = local[u.id] || new Set<number>();
                cur.forEach(d => { if (!orig.has(d)) ops.push(fetch("/api/attendance/day-off", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: u.id, day_of_week: d }) })); });
                orig.forEach(d => { if (!cur.has(d)) ops.push(fetch(`/api/attendance/day-off?user_id=${u.id}&day_of_week=${d}`, { method: "DELETE" })); });
            });
            await Promise.all(ops); onSaved(); onClose();
        } catch { setError("Gagal menyimpan. Coba lagi."); }
        finally { setSaving(false); }
    };

    const shown = filter ? users.filter(u => u.id === filter) : users;

    if (users.length === 0) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
                <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-[#1a1a2e]/20 border-t-[#1a1a2e] rounded-full animate-spin" />
                    <p className="text-sm text-gray-500">Memuat data karyawan...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">
                <div className="bg-[#1a1a2e] px-5 py-4 flex items-center justify-between flex-shrink-0">
                    <div>
                        <p className="font-bold text-white text-sm">Libur Mingguan Berulang</p>
                        <p className="text-xs text-slate-400 mt-0.5">Pilih hari libur tetap per karyawan</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/20 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="px-5 pt-4 pb-2 flex-shrink-0">
                    <select value={filter} onChange={e => setFilter(e.target.value)}
                        className="w-full sm:w-64 h-9 border border-gray-200 rounded-xl px-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition">
                        <option value="">Semua Karyawan</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.role.replace(/_/g, " ")}</option>)}
                    </select>
                </div>
                <div className="overflow-y-auto flex-1 px-5 pb-4">
                    <div className="space-y-2 mt-2">
                        {shown.map(u => (
                            <div key={u.id} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-7 h-7 rounded-full bg-[#1a1a2e] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                                        {u.name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-gray-800">{u.name}</p>
                                        <p className="text-[10px] text-gray-400">{u.role.replace(/_/g, " ")}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-7 gap-1">
                                    {DAY_NAMES.map((day, dow) => {
                                        const off = local[u.id]?.has(dow) ?? false;
                                        return (
                                            <button key={dow} type="button" onClick={() => toggle(u.id, dow)} title={DAY_FULL[dow]}
                                                className={`h-8 rounded-lg text-[10px] font-semibold transition-all border ${off ? "bg-red-100 text-red-700 border-red-200 ring-1 ring-red-300" : "bg-white text-gray-400 border-gray-200 hover:bg-gray-100"}`}>
                                                {day}
                                            </button>
                                        );
                                    })}
                                </div>
                                {local[u.id] && local[u.id].size > 0 && (
                                    <p className="text-[10px] text-red-600 mt-1.5">
                                        🔴 Libur: {Array.from(local[u.id]).sort().map(d => DAY_FULL[d]).join(", ")}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                {error && <div className="px-5 py-2 bg-red-50 border-t border-red-100"><p className="text-xs text-red-600">{error}</p></div>}
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0 bg-white">
                    <button onClick={onClose} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
                    <button onClick={save} disabled={saving}
                        className="flex-1 h-10 bg-[#1a1a2e] text-white rounded-xl text-sm font-semibold hover:bg-[#16213e] transition disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : "💾 Simpan"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── DateOffModal — libur tanggal spesifik ────────────────────────────────────
function DateOffModal({ users, calYear, calMonth, dateOffs, onClose, onSaved }: {
    users: UserInfo[]; calYear: number; calMonth: number;
    dateOffs: DateOff[]; onClose: () => void; onSaved: () => void;
}) {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [uid, setUid] = useState<string>(users[0]?.id ?? "");

    const origSet = useMemo(() => {
        const s = new Set<string>();
        dateOffs.forEach(d => { if (d.user_id === uid) s.add(d.off_date); });
        return s;
    }, [dateOffs, uid]);

    const [local, setLocal] = useState<Set<string>>(() => {
        const s = new Set<string>();
        dateOffs.forEach(d => { if (d.user_id === (users[0]?.id ?? "")) s.add(d.off_date); });
        return s;
    });

    useEffect(() => {
        const s = new Set<string>();
        dateOffs.forEach(d => { if (d.user_id === uid) s.add(d.off_date); });
        setLocal(s);
    }, [uid, dateOffs]);

    const dim = new Date(calYear, calMonth + 1, 0).getDate();
    const firstDow = new Date(calYear, calMonth, 1).getDay();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);

    const toggleDate = (day: number) => {
        const k = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        setLocal(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
    };

    const save = async () => {
        if (!uid) return;
        setSaving(true); setError("");
        try {
            const ops: Promise<any>[] = [];
            local.forEach(d => { if (!origSet.has(d)) ops.push(fetch("/api/attendance/date-off", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: uid, off_date: d }) })); });
            origSet.forEach(d => { if (!local.has(d)) ops.push(fetch(`/api/attendance/date-off?user_id=${uid}&off_date=${d}`, { method: "DELETE" })); });
            await Promise.all(ops); onSaved(); onClose();
        } catch { setError("Gagal menyimpan. Coba lagi."); }
        finally { setSaving(false); }
    };

    const sel = users.find(u => u.id === uid);
    const today = new Date().toISOString().slice(0, 10);

    if (users.length === 0) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
                <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                    <p className="text-sm text-gray-500">Memuat data karyawan...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">
                <div className="bg-orange-500 px-5 py-4 flex items-center justify-between flex-shrink-0">
                    <div>
                        <p className="font-bold text-white text-sm">Libur Tanggal Spesifik</p>
                        <p className="text-xs text-orange-100 mt-0.5">{MONTH_NAMES[calMonth]} {calYear} — klik tanggal untuk tandai libur</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/20 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Pilih karyawan */}
                <div className="px-5 pt-4 pb-3 flex-shrink-0 border-b border-gray-100">
                    <label className="text-xs font-medium text-gray-500 mb-1.5 block">Pilih Karyawan</label>
                    <select value={uid} onChange={e => setUid(e.target.value)}
                        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/30 transition">
                        {users.map(u => (
                            <option key={u.id} value={u.id}>{u.name} — {u.role.replace(/_/g, " ")}</option>
                        ))}
                    </select>
                    {local.size > 0 && (
                        <p className="text-[10px] text-orange-600 mt-1.5">
                            🟠 {local.size} tanggal libur dipilih bulan ini untuk {sel?.name}
                        </p>
                    )}
                </div>

                {/* Kalender */}
                <div className="overflow-y-auto flex-1 px-5 py-4">
                    <div className="grid grid-cols-7 mb-1.5">
                        {DAY_NAMES.map((d, i) => (
                            <div key={d} className={`text-center text-[10px] font-semibold uppercase py-1 ${i === 0 ? "text-red-400" : "text-gray-400"}`}>{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {cells.map((day, idx) => {
                            if (day === null) return <div key={`e-${idx}`} />;
                            const k = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                            const off = local.has(k);
                            const isT = k === today;
                            const dow = new Date(calYear, calMonth, day).getDay();
                            const isSun = dow === 0, isSat = dow === 6;
                            return (
                                <button key={day} onClick={() => toggleDate(day)}
                                    className={`relative flex flex-col items-center justify-center h-11 rounded-xl text-xs font-bold transition-all border ${off ? "bg-orange-500 text-white border-orange-500 shadow-sm scale-[1.04]"
                                        : isT ? "bg-blue-50 text-blue-600 border-blue-200"
                                            : isSun || isSat ? "text-gray-300 border-transparent hover:bg-gray-50"
                                                : "text-gray-700 border-transparent hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200"
                                        }`}>
                                    {day}
                                    {off && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-white/70" />}
                                </button>
                            );
                        })}
                    </div>

                    {/* Legenda */}
                    <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-100 flex-wrap">
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                            <span className="w-4 h-4 rounded-lg bg-orange-500 inline-block" />Hari libur
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                            <span className="w-4 h-4 rounded-lg bg-blue-50 border border-blue-200 inline-block" />Hari ini
                        </div>
                        <p className="text-[10px] text-gray-400 ml-auto">Klik untuk toggle libur</p>
                    </div>

                    {/* Preview chips */}
                    {local.size > 0 && (
                        <div className="mt-3 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2.5">
                            <p className="text-[10px] font-semibold text-orange-700 mb-1.5">Tanggal libur {sel?.name}:</p>
                            <div className="flex flex-wrap gap-1">
                                {Array.from(local).sort().map(date => (
                                    <span key={date} className="inline-flex items-center gap-1 text-[10px] font-mono bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded border border-orange-200">
                                        {new Date(date + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                        <button type="button"
                                            onClick={() => setLocal(p => { const n = new Set(p); n.delete(date); return n; })}
                                            className="text-orange-400 hover:text-red-600 font-bold ml-0.5">×</button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {error && <div className="px-5 py-2 bg-red-50 border-t border-red-100"><p className="text-xs text-red-600">{error}</p></div>}
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0 bg-white">
                    <button onClick={onClose} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
                    <button onClick={save} disabled={saving}
                        className="flex-1 h-10 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : "💾 Simpan Libur"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AttendanceDashboardPage() {
    const [attendances, setAttendances] = useState<Attendance[]>([]);
    const [dayOffs, setDayOffs] = useState<DayOff[]>([]);
    const [dateOffs, setDateOffs] = useState<DateOff[]>([]);
    const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [filterUser, setFilterUser] = useState("Semua");
    const [searchTerm, setSearchTerm] = useState("");
    const [showPicker, setShowPicker] = useState(false);
    const [showDayOffModal, setShowDayOffModal] = useState(false);
    const [showDateOffModal, setShowDateOffModal] = useState(false);

    const today = new Date();
    const todayKey = toWIBDateKey(new Date().toISOString());
    const [calYear, setCalYear] = useState(today.getFullYear());
    const [calMonth, setCalMonth] = useState(today.getMonth());
    const [selectedDate, setSelectedDate] = useState<string | null>(todayKey);
    const [usersLoading, setUsersLoading] = useState(false);

    useEffect(() => {
        const init = async () => {
            const user = await getCurrentUserClient();
            setCurrentUser(user);
            await Promise.all([
                fetchAttendance(),
                fetchDayOffs(),
                fetchDateOffs(today.getFullYear(), today.getMonth()),
                fetchAllUsers(),
            ]);
        };
        init();
    }, []);

    useEffect(() => { fetchDateOffs(calYear, calMonth); }, [calYear, calMonth]);

    // ── Fetchers ──────────────────────────────────────────────────────────────
    const fetchAttendance = async () => {
        setLoading(true);
        try {
            const r = await fetch("/api/attendance"); const d = await r.json();
            if (d.success) setAttendances((d.data || []).map((a: Attendance) => ({ ...a, displayStatus: getDisplayStatus(a) })));
        } catch { } finally { setLoading(false); }
    };
    const fetchDayOffs = async () => {
        try { const r = await fetch("/api/attendance/day-off"); const d = await r.json(); if (d.success) setDayOffs(d.data || []); } catch { }
    };
    const fetchDateOffs = async (year: number, month: number) => {
        try { const r = await fetch(`/api/attendance/date-off?year=${year}&month=${month + 1}`); const d = await r.json(); if (d.success) setDateOffs(d.data || []); } catch { }
    };
    const fetchAllUsers = async () => {
        setUsersLoading(true);
        try {
            const r = await fetch("/api/attendance/users");
            const d = await r.json();
            if (d.success) setAllUsers(d.data || []);
        } catch { }
        finally { setUsersLoading(false); }
    };

    // ── Maps ──────────────────────────────────────────────────────────────────
    // Mingguan: user_name → Set<day_of_week>
    const dayOffByUser = useMemo(() => {
        const m: Record<string, Set<number>> = {};
        dayOffs.forEach(d => { const n = d.users?.name; if (!n) return; if (!m[n]) m[n] = new Set(); m[n].add(d.day_of_week); });
        return m;
    }, [dayOffs]);

    // Spesifik: user_name → Set<"YYYY-MM-DD">
    const dateOffByUser = useMemo(() => {
        const m: Record<string, Set<string>> = {};
        dateOffs.forEach(d => { const n = d.users?.name; if (!n) return; if (!m[n]) m[n] = new Set(); m[n].add(d.off_date); });
        return m;
    }, [dateOffs]);

    const allUsersById = useMemo(() => {
        const m: Record<string, UserInfo> = {};
        allUsers.forEach(u => { m[u.id] = u; });
        return m;
    }, [allUsers]);

    // Helper gabungan: siapa yang libur di tanggal tertentu
    const getOffUsersForDate = (dateKey: string): string[] => {
        const dow = new Date(dateKey + "T12:00:00").getDay();
        const weekly = Object.entries(dayOffByUser).filter(([, s]) => s.has(dow)).map(([n]) => n);
        const specific = Object.entries(dateOffByUser).filter(([, s]) => s.has(dateKey)).map(([n]) => n);
        return [...new Set([...weekly, ...specific])];
    };

    // ── Derived data ──────────────────────────────────────────────────────────
    const filteredByUser = useMemo(() => {
        return attendances.filter(a => {
            if (filterUser !== "Semua" && a.user_name !== filterUser) return false;
            if (searchTerm && !a.user_name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            return true;
        });
    }, [attendances, filterUser, searchTerm]);

    const byDate = useMemo(() => {
        const m: Record<string, Attendance[]> = {};
        filteredByUser.forEach(a => { const k = toWIBDateKey(a.check_in_time || a.created_at); if (!m[k]) m[k] = []; m[k].push(a); });
        return m;
    }, [filteredByUser]);

    const selectedAttendances = useMemo(() => {
        if (!selectedDate) return [];
        return (byDate[selectedDate] || []).sort((a, b) => new Date(a.check_in_time).getTime() - new Date(b.check_in_time).getTime());
    }, [selectedDate, byDate]);

    const uniqueUsers = useMemo(() => {
        if (allUsers.length > 0) {
            return ["Semua", ...allUsers.map(u => u.name).sort()];
        }
        const u = [...new Set(attendances.map(a => a.user_name))].sort();
        return ["Semua", ...u];
    }, [allUsers, attendances]);

    const thisMonthKey = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;
    const thisMonthAtt = filteredByUser.filter(a => toWIBDateKey(a.check_in_time || a.created_at).startsWith(thisMonthKey));
    const thisMonthPresent = thisMonthAtt.filter(a => a.displayStatus === "PRESENT").length;
    const thisMonthLate = thisMonthAtt.filter(a => a.displayStatus === "LATE").length;
    const thisMonthDays = new Set(thisMonthAtt.map(a => toWIBDateKey(a.check_in_time || a.created_at))).size;

    const userSummary = useMemo(() => {
        const m: Record<string, { present: number; late: number; name: string }> = {};
        thisMonthAtt.forEach(a => {
            if (!m[a.user_name]) m[a.user_name] = { present: 0, late: 0, name: a.user_name };
            a.displayStatus === "PRESENT" ? m[a.user_name].present++ : m[a.user_name].late++;
        });
        return Object.values(m).sort((a, b) => (b.present + b.late) - (a.present + a.late));
    }, [thisMonthAtt]);

    const calDays = useMemo(() => {
        const fd = new Date(calYear, calMonth, 1).getDay(), dim = new Date(calYear, calMonth + 1, 0).getDate();
        const c: (number | null)[] = []; for (let i = 0; i < fd; i++) c.push(null); for (let d = 1; d <= dim; d++) c.push(d); return c;
    }, [calYear, calMonth]);

    const prevMonth = () => { if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); } else setCalMonth(m => m - 1); setSelectedDate(null); };
    const nextMonth = () => { if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); } else setCalMonth(m => m + 1); setSelectedDate(null); };
    const handleDayClick = (day: number) => {
        const k = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        setSelectedDate(p => p === k ? null : k);
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <DashboardLayout>
            <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                            {currentUser?.role === "ADMIN" ? "Laporan Absensi Karyawan" : "Riwayat Absensi Saya"}
                        </h1>
                        <p className="text-xs text-gray-400 mt-0.5">{MONTH_NAMES[calMonth]} {calYear}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {currentUser?.role === "ADMIN" && (
                            <>
                                <button onClick={() => setShowDayOffModal(true)}
                                    className="flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl transition hover:bg-red-100">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    Libur Mingguan
                                </button>
                                <button onClick={() => setShowDateOffModal(true)}
                                    className="flex items-center gap-1.5 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 px-3 py-2 rounded-xl transition hover:bg-orange-100">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                    </svg>
                                    Libur Spesifik
                                </button>
                            </>
                        )}
                        <button onClick={fetchAttendance}
                            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-xl transition bg-white">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Stat Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { label: "Hari Hadir", value: thisMonthDays, icon: "📅", color: "text-gray-800", border: "border-gray-100" },
                        { label: "Tepat Waktu", value: thisMonthPresent, icon: "✅", color: "text-emerald-700", border: "border-emerald-100" },
                        { label: "Terlambat", value: thisMonthLate, icon: "⏰", color: "text-amber-700", border: "border-amber-100" },
                        { label: "Karyawan", value: uniqueUsers.length - 1, icon: "👥", color: "text-gray-800", border: "border-gray-100" },
                    ].map(c => (
                        <div key={c.label} className={`bg-white rounded-2xl border ${c.border} shadow-sm p-4`}>
                            <div className="flex items-start justify-between">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{c.label}</p>
                                <span className="text-base opacity-60">{c.icon}</span>
                            </div>
                            <p className={`text-2xl font-bold mt-1.5 ${c.color}`}>
                                {loading ? <Shimmer className="w-10 h-7 inline-block" /> : c.value}
                            </p>
                            <p className="text-[10px] text-gray-300 mt-0.5">bulan ini</p>
                        </div>
                    ))}
                </div>

                {/* Filter ADMIN */}
                {currentUser?.role === "ADMIN" && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2.5">
                        <div className="flex flex-wrap gap-1.5">
                            {uniqueUsers.map(n => (
                                <button key={n} onClick={() => setFilterUser(n)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filterUser === n ? "bg-[#1a1a2e] text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                                    {n}
                                </button>
                            ))}
                        </div>
                        <input type="text" placeholder="Cari nama karyawan..." value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full sm:w-64 h-9 border border-gray-200 rounded-xl px-3 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition"
                        />
                    </div>
                )}

                {/* Kalender + Panel kanan */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

                    {/* Kalender */}
                    <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-visible">
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                            <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <div className="relative">
                                <button onClick={() => setShowPicker(p => !p)}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition">
                                    <span className="text-sm font-semibold text-gray-800">{MONTH_NAMES[calMonth]} {calYear}</span>
                                    <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showPicker ? "rotate-180" : ""}`}
                                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                {showPicker && (
                                    <MonthYearPicker year={calYear} month={calMonth}
                                        onChange={(y, m) => { setCalYear(y); setCalMonth(m); setSelectedDate(null); }}
                                        onClose={() => setShowPicker(false)}
                                    />
                                )}
                            </div>
                            <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>

                        <div className="p-4">
                            <div className="grid grid-cols-7 mb-2">
                                {DAY_NAMES.map((d, i) => (
                                    <div key={d} className={`text-center text-[10px] font-semibold uppercase py-1 ${i === 0 ? "text-red-400" : "text-gray-400"}`}>{d}</div>
                                ))}
                            </div>
                            {loading ? (
                                <div className="grid grid-cols-7 gap-1">
                                    {Array(35).fill(0).map((_, i) => <div key={i} className="h-14 rounded-xl bg-gray-50 animate-pulse" />)}
                                </div>
                            ) : (
                                <div className="grid grid-cols-7 gap-1">
                                    {calDays.map((day, idx) => {
                                        if (day === null) return <div key={`e-${idx}`} />;
                                        const dk = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                                        const dd = byDate[dk] || [];
                                        const pc = dd.filter(a => a.displayStatus === "PRESENT").length;
                                        const lc = dd.filter(a => a.displayStatus === "LATE").length;
                                        const tot = dd.length;
                                        const isTod = dk === todayKey, isSel = dk === selectedDate;
                                        const dow = new Date(calYear, calMonth, day).getDay();
                                        const isSun = dow === 0, isSat = dow === 6, has = tot > 0;

                                        // Libur hanya untuk filter spesifik
                                        const isDayOff = filterUser !== "Semua"
                                            ? (dayOffByUser[filterUser]?.has(dow) ?? false) || (dateOffByUser[filterUser]?.has(dk) ?? false)
                                            : false;

                                        return (
                                            <button key={day} onClick={() => handleDayClick(day)}
                                                title={isDayOff ? `Hari libur ${filterUser}` : undefined}
                                                className={`relative flex flex-col items-center pt-1.5 pb-1 px-0.5 rounded-xl min-h-[58px] transition-all ${isSel ? "bg-[#1a1a2e] shadow-md ring-2 ring-[#1a1a2e]/30"
                                                    : isTod ? "bg-blue-50 ring-1 ring-blue-200"
                                                        : isDayOff && !has ? "bg-red-50/60"
                                                            : has ? "bg-gray-50 hover:bg-gray-100"
                                                                : "hover:bg-gray-50"
                                                    }`}>
                                                {isDayOff && filterUser !== "Semua" && (
                                                    <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${isSel ? "bg-red-300" : "bg-red-400"}`} />
                                                )}
                                                <span className={`text-xs font-bold mb-1 ${isSel ? "text-white" : isTod ? "text-blue-600"
                                                    : isDayOff && filterUser !== "Semua" ? "text-red-500"
                                                        : isSun ? "text-red-300" : isSat ? "text-gray-400" : "text-gray-700"
                                                    }`}>{day}</span>
                                                {has && (
                                                    <div className="flex flex-col items-center gap-0.5 w-full px-1">
                                                        {pc > 0 && <div className={`w-full h-1 rounded-full ${isSel ? "bg-emerald-300" : "bg-emerald-400"}`} />}
                                                        {lc > 0 && <div className={`w-full h-1 rounded-full ${isSel ? "bg-amber-300" : "bg-amber-400"}`} />}
                                                    </div>
                                                )}
                                                {tot > 0 && <span className={`text-[9px] font-bold mt-0.5 ${isSel ? "text-white/70" : "text-gray-400"}`}>{tot}</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Legenda */}
                            <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-100 flex-wrap">
                                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                                    <span className="w-4 h-1 rounded-full bg-emerald-400 inline-block" />Tepat waktu
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                                    <span className="w-4 h-1 rounded-full bg-amber-400 inline-block" />Terlambat
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                                    <span className="w-4 h-3.5 rounded-md bg-blue-50 border border-blue-200 inline-block" />Hari ini
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-red-500">
                                    <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Hari libur
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Panel kanan */}
                    <div className="lg:col-span-2 flex flex-col gap-4">
                        {selectedDate ? (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-800">
                                            {new Date(selectedDate + "T12:00:00+07:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
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
                                            {(() => {
                                                const off = getOffUsersForDate(selectedDate);
                                                return off.length > 0 ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                                                        🔴 Libur: {off.slice(0, 2).join(", ")}{off.length > 2 ? ` +${off.length - 2}` : ""}
                                                    </span>
                                                ) : null;
                                            })()}
                                        </div>
                                    </div>
                                    <button onClick={() => setSelectedDate(null)}
                                        className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 transition">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>

                                {selectedAttendances.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10">
                                        <div className="text-3xl mb-2 opacity-40">📅</div>
                                        {(() => {
                                            const off = getOffUsersForDate(selectedDate);
                                            const myOff = currentUser?.name && off.includes(currentUser.name);
                                            return off.length > 0 ? (
                                                <div className="text-center px-4">
                                                    <div className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-2">
                                                        🔴 Hari Libur
                                                    </div>
                                                    {myOff && currentUser?.role !== "ADMIN" ? (
                                                        <p className="text-sm text-red-500 font-medium">Ini hari libur kamu 🎉</p>
                                                    ) : (
                                                        <>
                                                            <p className="text-xs text-red-500 font-medium mb-1">Hari libur untuk:</p>
                                                            {off.map(n => <p key={n} className="text-xs text-red-400">• {n}</p>)}
                                                        </>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-gray-400">Tidak ada absensi hari ini</p>
                                            );
                                        })()}
                                    </div>
                                ) : (
                                    <div className="overflow-y-auto max-h-[360px] lg:max-h-[420px] divide-y divide-gray-50">
                                        {selectedAttendances.map(a => (
                                            <div key={a.id} className="px-4 py-3 hover:bg-gray-50/50 transition">
                                                <div className="flex items-start gap-3">
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
                                                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${a.displayStatus === "PRESENT" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                                                                {a.displayStatus === "PRESENT" ? "Tepat" : "Terlambat"}
                                                            </span>
                                                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${a.method === "FACE" ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                                                                {a.method === "FACE" ? "Wajah" : "Manual"}
                                                            </span>
                                                        </div>
                                                        <div className="mt-1.5">
                                                            <LocationBadge lat={a.latitude} lng={a.longitude} accuracy={a.accuracy} />
                                                        </div>
                                                        {a.device && <p className="text-[10px] text-gray-300 mt-1 truncate">{a.device}</p>}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-12 px-6 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-4">
                                    <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <p className="text-sm font-medium text-gray-600">Pilih tanggal di kalender</p>
                                <p className="text-xs text-gray-400 mt-1 leading-relaxed">Klik tanggal untuk melihat<br />detail absensi hari itu</p>
                                {Object.keys(byDate).filter(k => k.startsWith(thisMonthKey)).length > 0 && (
                                    <div className="mt-4 w-full">
                                        <p className="text-[10px] text-gray-400 mb-2">Tanggal dengan data bulan ini:</p>
                                        <div className="flex flex-wrap gap-1 justify-center">
                                            {Object.keys(byDate).filter(k => k.startsWith(thisMonthKey)).sort().slice(0, 10).map(k => (
                                                <button key={k} onClick={() => setSelectedDate(k)}
                                                    className="text-[10px] font-mono px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg hover:bg-[#1a1a2e] hover:text-white hover:border-[#1a1a2e] transition">
                                                    {k.slice(8)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Ringkasan per karyawan */}
                        {currentUser?.role === "ADMIN" && userSummary.length > 0 && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="px-4 py-3 border-b border-gray-100">
                                    <p className="text-xs font-semibold text-gray-700">Ringkasan {MONTH_NAMES[calMonth]}</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Total per karyawan</p>
                                </div>
                                <div className="divide-y divide-gray-50 max-h-[280px] overflow-y-auto">
                                    {userSummary.map(u => {
                                        const tot = u.present + u.late;
                                        const pct = tot > 0 ? Math.round((u.present / tot) * 100) : 0;
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
                                                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
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

            {/* Modal Libur Mingguan */}
            {showDayOffModal && currentUser?.role === "ADMIN" && (
                <DayOffModal users={allUsers} dayOffs={dayOffs}
                    onClose={() => setShowDayOffModal(false)}
                    onSaved={() => { fetchDayOffs(); setShowDayOffModal(false); }}
                />
            )}

            {/* Modal Libur Tanggal Spesifik */}
            {showDateOffModal && currentUser?.role === "ADMIN" && (
                <DateOffModal users={allUsers} calYear={calYear} calMonth={calMonth}
                    dateOffs={dateOffs}
                    onClose={() => setShowDateOffModal(false)}
                    onSaved={() => { fetchDateOffs(calYear, calMonth); setShowDateOffModal(false); }}
                />
            )}
        </DashboardLayout>
    );
}