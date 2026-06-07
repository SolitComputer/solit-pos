"use client";

import { useEffect, useState, useMemo } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";
import DashboardLayout from "@/components/layout/DashboardLayout";

type Attendance = {
    id: string; user_name: string; user_role: string; date: string;
    check_in_time: string; status: string; method: string;
    latitude: number | null; longitude: number | null; accuracy: number | null;
    device: string; ip_address: string; face_distance: number | null; created_at: string;
    displayStatus?: "PRESENT" | "LATE"; user_shift?: "PAGI" | "SORE";
};
type DayOff = { id: string; user_id: string; day_of_week: number; notes?: string; users?: { id: string; name: string; role: string }; };
type DateOff = { id: string; user_id: string; off_date: string; notes?: string; users?: { id: string; name: string; role: string }; };
type UserInfo = { id: string; name: string; role: string };

const OFFICE_LAT = -6.402593;
const OFFICE_LNG = 106.787233;
const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const DAY_FULL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000, dLat = ((lat2 - lat1) * Math.PI) / 180, dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function toWIBTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}
function isLate(t: string, shift: "PAGI" | "SORE" = "PAGI"): boolean {
    const wib = new Date(new Date(t).getTime() + 7 * 60 * 60 * 1000);
    return wib.getUTCHours() * 60 + wib.getUTCMinutes() > (shift === "PAGI" ? 8 * 60 : 16 * 60);
}
function getDisplayStatus(a: Attendance): "PRESENT" | "LATE" {
    if (a.method === "FORCE") return "PRESENT";
    if (isLate(a.check_in_time || a.created_at, a.user_shift ?? "PAGI")) return "LATE";
    return "PRESENT";
}
function toWIBDateKey(iso: string): string {
    return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function countWorkingDays(year: number, month: number, dayOffDows: Set<number>, offDates: Set<string>): number {
    const dim = new Date(year, month + 1, 0).getDate(); let c = 0;
    for (let d = 1; d <= dim; d++) {
        const dk = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const dow = new Date(dk + "T12:00:00").getDay();
        if (!dayOffDows.has(dow) && !offDates.has(dk)) c++;
    }
    return c;
}

// ── Modern Modal Shell with Glassmorphism ───────────────────────────────────
function ModalShell({ onClose, headerColor, title, subtitle, children, footer }: {
    onClose: () => void; headerColor: string; title: string; subtitle?: string;
    children: React.ReactNode; footer: React.ReactNode;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-all duration-300" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden animate-scaleIn">
                <div className={`${headerColor} px-6 py-5 flex items-start justify-between flex-shrink-0`}>
                    <div>
                        <p className="font-bold text-white text-base tracking-tight">{title}</p>
                        {subtitle && <p className="text-xs text-white/70 mt-1">{subtitle}</p>}
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-all duration-200 mt-0.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                {children}
                <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-white/95 backdrop-blur-sm">
                    {footer}
                </div>
            </div>
        </div>
    );
}

function DayOffModal({ users, dayOffs, onClose, onSaved }: { users: UserInfo[]; dayOffs: DayOff[]; onClose: () => void; onSaved: () => void }) {
    const [saving, setSaving] = useState(false);
    const [filter, setFilter] = useState("");
    const [error, setError] = useState("");
    const origMap = useMemo(() => { const m: Record<string, Set<number>> = {}; dayOffs.forEach(d => { if (!m[d.user_id]) m[d.user_id] = new Set(); m[d.user_id].add(d.day_of_week); }); return m; }, [dayOffs]);
    const [local, setLocal] = useState<Record<string, Set<number>>>(() => { const m: Record<string, Set<number>> = {}; dayOffs.forEach(d => { if (!m[d.user_id]) m[d.user_id] = new Set(); m[d.user_id].add(d.day_of_week); }); return m; });
    const toggle = (uid: string, dow: number) => setLocal(prev => { const n = { ...prev }; if (!n[uid]) n[uid] = new Set(); const s = new Set(n[uid]); s.has(dow) ? s.delete(dow) : s.add(dow); n[uid] = s; return n; });
    const save = async () => { setSaving(true); setError(""); try { const ops: Promise<any>[] = []; users.forEach(u => { const orig = origMap[u.id] || new Set<number>(), cur = local[u.id] || new Set<number>(); cur.forEach(d => { if (!orig.has(d)) ops.push(fetch("/api/attendance/day-off", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: u.id, day_of_week: d }) })); }); orig.forEach(d => { if (!cur.has(d)) ops.push(fetch(`/api/attendance/day-off?user_id=${u.id}&day_of_week=${d}`, { method: "DELETE" })); }); }); await Promise.all(ops); onSaved(); onClose(); } catch { setError("Gagal menyimpan."); } finally { setSaving(false); } };
    const shown = filter ? users.filter(u => u.id === filter) : users;
    return (
        <ModalShell onClose={onClose} headerColor="bg-gradient-to-r from-[#1a1a2e] to-[#16213e]" title="Libur Mingguan Berulang" subtitle="Pilih hari libur tetap per karyawan"
            footer={
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all duration-200">Batal</button>
                    <button onClick={save} disabled={saving} className="flex-1 h-11 bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : "💾 Simpan"}
                    </button>
                </div>
            }>
            <div className="px-6 pt-5 pb-3 flex-shrink-0 border-b border-gray-100">
                <select value={filter} onChange={e => setFilter(e.target.value)} className="w-full sm:w-72 h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50/60 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition-all duration-200">
                    <option value="">Semua Karyawan</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.role.replace(/_/g, " ")}</option>)}
                </select>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
                {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-2.5 rounded-xl">{error}</div>}
                <div className="space-y-3">
                    {shown.map(u => (
                        <div key={u.id} className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-4 border border-gray-100 hover:shadow-md transition-all duration-200">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-md">{u.name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}</div>
                                <div><p className="text-sm font-bold text-gray-800">{u.name}</p><p className="text-[10px] text-gray-400 font-medium">{u.role.replace(/_/g, " ")}</p></div>
                            </div>
                            <div className="grid grid-cols-7 gap-1.5">
                                {DAY_NAMES.map((day, dow) => { const off = local[u.id]?.has(dow) ?? false; return (<button key={dow} type="button" onClick={() => toggle(u.id, dow)} title={DAY_FULL[dow]} className={`h-9 rounded-xl text-[11px] font-bold transition-all duration-200 border ${off ? "bg-red-500 text-white border-red-500 shadow-md scale-105" : "bg-white text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600 hover:scale-105"}`}>{day}</button>); })}
                            </div>
                            {local[u.id] && local[u.id].size > 0 && <p className="text-[11px] text-red-500 font-medium mt-2.5 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0"/>Libur: {Array.from(local[u.id]).sort().map(d => DAY_FULL[d]).join(", ")}</p>}
                        </div>
                    ))}
                </div>
            </div>
        </ModalShell>
    );
}

function DateOffModal({ users, calYear, calMonth, dateOffs, onClose, onSaved }: { users: UserInfo[]; calYear: number; calMonth: number; dateOffs: DateOff[]; onClose: () => void; onSaved: () => void }) {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [uid, setUid] = useState<string>(users[0]?.id ?? "");
    const origSet = useMemo(() => { const s = new Set<string>(); dateOffs.forEach(d => { if (d.user_id === uid) s.add(d.off_date); }); return s; }, [dateOffs, uid]);
    const [local, setLocal] = useState<Set<string>>(() => { const s = new Set<string>(); dateOffs.forEach(d => { if (d.user_id === (users[0]?.id ?? "")) s.add(d.off_date); }); return s; });
    useEffect(() => { const s = new Set<string>(); dateOffs.forEach(d => { if (d.user_id === uid) s.add(d.off_date); }); setLocal(s); }, [uid, dateOffs]);
    const dim = new Date(calYear, calMonth + 1, 0).getDate(), firstDow = new Date(calYear, calMonth, 1).getDay();
    const cells: (number | null)[] = []; for (let i = 0; i < firstDow; i++) cells.push(null); for (let d = 1; d <= dim; d++) cells.push(d);
    const save = async () => { if (!uid) return; setSaving(true); setError(""); try { const ops: Promise<any>[] = []; local.forEach(d => { if (!origSet.has(d)) ops.push(fetch("/api/attendance/date-off", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: uid, off_date: d }) })); }); origSet.forEach(d => { if (!local.has(d)) ops.push(fetch(`/api/attendance/date-off?user_id=${uid}&off_date=${d}`, { method: "DELETE" })); }); await Promise.all(ops); onSaved(); onClose(); } catch { setError("Gagal menyimpan."); } finally { setSaving(false); } };
    const sel = users.find(u => u.id === uid);
    const today = new Date().toISOString().slice(0, 10);
    return (
        <ModalShell onClose={onClose} headerColor="bg-gradient-to-r from-orange-500 to-orange-600" title="Libur Tanggal Spesifik" subtitle={`${MONTH_NAMES[calMonth]} ${calYear}`}
            footer={
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all duration-200">Batal</button>
                    <button onClick={save} disabled={saving} className="flex-1 h-11 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : "💾 Simpan Libur"}
                    </button>
                </div>
            }>
            <div className="px-6 pt-5 pb-4 flex-shrink-0 border-b border-gray-100">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Pilih Karyawan</label>
                <select value={uid} onChange={e => setUid(e.target.value)} className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50/60 text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400/20 transition-all duration-200">
                    {users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.role.replace(/_/g, " ")}</option>)}
                </select>
                {local.size > 0 && <p className="text-[11px] text-orange-600 font-medium mt-2 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0"/>{local.size} tanggal dipilih untuk {sel?.name}</p>}
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5">
                <div className="grid grid-cols-7 mb-3">{DAY_NAMES.map((d, i) => <div key={d} className={`text-center text-[10px] font-bold uppercase py-1 tracking-wider ${i === 0 ? "text-red-400" : "text-gray-400"}`}>{d}</div>)}</div>
                <div className="grid grid-cols-7 gap-2">
                    {cells.map((day, idx) => {
                        if (day === null) return <div key={`e-${idx}`} />;
                        const k = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        const off = local.has(k), isT = k === today, dow = new Date(calYear, calMonth, day).getDay();
                        return (<button key={day} onClick={() => setLocal(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; })} className={`relative flex flex-col items-center justify-center h-12 rounded-xl text-xs font-black transition-all duration-200 border ${off ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white border-orange-500 shadow-md scale-105" : isT ? "bg-blue-100 text-blue-700 border-blue-200" : dow === 0 || dow === 6 ? "text-gray-300 border-transparent hover:bg-gray-50" : "text-gray-700 border-transparent hover:bg-orange-50 hover:text-orange-600 hover:scale-105"}`}>{day}{off && <span className="absolute bottom-1.5 w-1 h-1 rounded-full bg-white/70" />}</button>);
                    })}
                </div>
                {local.size > 0 && (<div className="mt-4 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 rounded-2xl px-4 py-3"><p className="text-[11px] font-bold text-orange-700 mb-2">Tanggal libur {sel?.name}:</p><div className="flex flex-wrap gap-1.5">{Array.from(local).sort().map(date => (<span key={date} className="inline-flex items-center gap-1 text-[10px] font-mono bg-orange-100 text-orange-700 px-2 py-1 rounded-lg border border-orange-200">{new Date(date + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })}<button type="button" onClick={() => setLocal(p => { const n = new Set(p); n.delete(date); return n; })} className="text-orange-400 hover:text-red-600 font-bold ml-0.5 transition-all duration-200">×</button></span>))}</div></div>)}
            </div>
        </ModalShell>
    );
}

// ─── Modern MonthSelector ────────────────────────────────────────────────────
function MonthSelector({ onSelect }: { onSelect: (year: number, month: number) => void }) {
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const years = Array.from({ length: 4 }, (_, i) => today.getFullYear() - 1 + i);
    return (
        <div className="max-w-2xl mx-auto px-4 py-12 animate-fadeIn">
            <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] shadow-lg mb-4">
                    <span className="text-3xl">📊</span>
                </div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-[#1a1a2e] to-[#16213e] bg-clip-text text-transparent tracking-tight">Absensi Karyawan</h1>
                <p className="text-sm text-gray-400 mt-2">Pilih bulan untuk melihat laporan absensi</p>
            </div>
            <div className="flex items-center justify-center gap-2.5 mb-8">
                <button onClick={() => setYear(y => y - 1)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-all duration-200 shadow-sm hover:shadow-md active:scale-95">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="flex gap-2 flex-wrap justify-center">{years.map(y => (<button key={y} onClick={() => setYear(y)} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 border ${year === y ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white border-[#1a1a2e] shadow-md scale-105" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:scale-105"}`}>{y}</button>))}</div>
                <button onClick={() => setYear(y => y + 1)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-all duration-200 shadow-sm hover:shadow-md active:scale-95">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                {MONTH_NAMES.map((name, idx) => {
                    const isCurrent = year === today.getFullYear() && idx === today.getMonth();
                    const isFuture = year > today.getFullYear() || (year === today.getFullYear() && idx > today.getMonth());
                    const isPast = year < today.getFullYear() || (year === today.getFullYear() && idx < today.getMonth());
                    return (<button key={idx} onClick={() => !isFuture && onSelect(year, idx)} disabled={isFuture} className={`relative group flex flex-col items-center justify-center gap-2 py-7 rounded-2xl border transition-all duration-300 ${isCurrent ? "bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border-[#1a1a2e] text-white shadow-xl scale-[1.02]" : isFuture ? "bg-gray-50/80 border-gray-100 text-gray-300 cursor-not-allowed" : "bg-white border-gray-200 text-gray-700 hover:border-[#1a1a2e] hover:bg-gradient-to-br hover:from-[#1a1a2e]/5 hover:to-[#16213e]/5 hover:text-[#1a1a2e] hover:scale-105 hover:shadow-lg cursor-pointer shadow-sm"}`}>
                        {isCurrent && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />}
                        <span className="text-4xl font-black tracking-tighter">{String(idx + 1).padStart(2, "0")}</span>
                        <span className={`text-[11px] font-semibold uppercase tracking-wide ${isCurrent ? "text-white/70" : isFuture ? "text-gray-300" : "text-gray-400 group-hover:text-[#1a1a2e]/60"}`}>{MONTH_SHORT[idx]}</span>
                        {isCurrent && <span className="text-[9px] text-emerald-300 font-bold tracking-wider uppercase mt-1">Bulan ini</span>}
                    </button>);
                })}
            </div>
            <p className="text-center text-[11px] text-gray-300 mt-8">Bulan yang akan datang belum tersedia</p>
        </div>
    );
}

function ScheduleModal({ users, onClose }: { users: UserInfo[]; onClose: () => void }) {
    const [uid, setUid] = useState(users[0]?.id ?? "");
    const [schedules, setSchedules] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ day_of_week: 1, start_hour: 8, start_minute: 0, late_hour: 9, late_minute: 0, end_hour: 17, end_minute: 0, notes: "" });

    useEffect(() => {
        if (!uid) return;
        fetch(`/api/attendance/schedule?user_id=${uid}`).then(r => r.json()).then(d => { if (d.success) setSchedules(d.data); });
    }, [uid]);

    const save = async () => {
        setSaving(true);
        try {
            await fetch("/api/attendance/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: uid, ...form }) });
            const r = await fetch(`/api/attendance/schedule?user_id=${uid}`);
            const d = await r.json(); if (d.success) setSchedules(d.data);
        } finally { setSaving(false); }
    };

    const del = async (dow: number) => {
        await fetch(`/api/attendance/schedule?user_id=${uid}&day_of_week=${dow}`, { method: "DELETE" });
        setSchedules(s => s.filter(x => x.day_of_week !== dow));
    };

    return (
        <ModalShell onClose={onClose} headerColor="bg-gradient-to-r from-blue-600 to-blue-700" title="🕐 Jadwal Custom per Hari" subtitle="Atur jam masuk berbeda per hari per karyawan"
            footer={<button onClick={onClose} className="w-full h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all duration-200">Tutup</button>}>
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Karyawan</label>
                <select value={uid} onChange={e => setUid(e.target.value)} className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50/60 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all duration-200">
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5">
                    <p className="text-xs font-bold text-blue-700 mb-4">Tambah / Update Jadwal</p>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Hari</label>
                            <select value={form.day_of_week} onChange={e => setForm(f => ({ ...f, day_of_week: Number(e.target.value) }))} className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none transition-all duration-200">
                                {DAY_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Catatan <span className="text-gray-300 normal-case font-normal">(opsional)</span></label>
                            <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. kelas pagi" className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none transition-all duration-200" />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        {[{ label: "Buka Absen", hKey: "start_hour", mKey: "start_minute" }, { label: "Batas Tepat", hKey: "late_hour", mKey: "late_minute" }, { label: "Tutup Absen", hKey: "end_hour", mKey: "end_minute" }].map(({ label, hKey, mKey }) => (
                            <div key={hKey}>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">{label}</label>
                                <div className="flex gap-1 items-center">
                                    <input type="number" min={0} max={23} value={(form as any)[hKey]} onChange={e => setForm(f => ({ ...f, [hKey]: Number(e.target.value) }))} className="w-12 h-10 border border-gray-200 rounded-xl px-1.5 text-sm bg-white focus:outline-none text-center font-mono font-bold transition-all duration-200" />
                                    <span className="text-gray-300 text-sm font-bold">:</span>
                                    <input type="number" min={0} max={59} value={(form as any)[mKey]} onChange={e => setForm(f => ({ ...f, [mKey]: Number(e.target.value) }))} className="w-12 h-10 border border-gray-200 rounded-xl px-1.5 text-sm bg-white focus:outline-none text-center font-mono font-bold transition-all duration-200" />
                                </div>
                            </div>
                        ))}
                    </div>
                    <button onClick={save} disabled={saving} className="w-full h-10 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : "💾 Simpan Jadwal"}
                    </button>
                </div>
                {schedules.length > 0 && (
                    <div>
                        <p className="text-xs font-bold text-gray-600 mb-3 uppercase tracking-wide">Jadwal Tersimpan</p>
                        <div className="space-y-2">
                            {schedules.map(s => (
                                <div key={s.id} className="bg-white border border-gray-100 rounded-2xl px-5 py-3.5 flex items-center justify-between shadow-sm hover:shadow-md transition-all duration-200">
                                    <div>
                                        <p className="text-sm font-bold text-gray-800">{DAY_FULL[s.day_of_week]}</p>
                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                            Buka: <span className="font-mono font-bold text-blue-600">{String(s.start_hour).padStart(2, "0")}:{String(s.start_minute).padStart(2, "0")}</span>
                                            {" · "}Tepat s/d: <span className="font-mono font-bold text-emerald-600">{String(s.late_hour).padStart(2, "0")}:{String(s.late_minute).padStart(2, "0")}</span>
                                            {" · "}Tutup: <span className="font-mono font-bold text-gray-600">{String(s.end_hour).padStart(2, "0")}:{String(s.end_minute).padStart(2, "0")}</span>
                                            {s.notes && <span className="text-gray-400"> · {s.notes}</span>}
                                        </p>
                                    </div>
                                    <button onClick={() => del(s.day_of_week)} className="w-8 h-8 flex items-center justify-center rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-all duration-200 text-lg font-bold">×</button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {schedules.length === 0 && (
                    <div className="text-center py-8 text-gray-300 text-sm">Belum ada jadwal custom. Menggunakan jam shift default.</div>
                )}
            </div>
        </ModalShell>
    );
}

function DateScheduleModal({ users, calYear, calMonth, onClose }: { users: UserInfo[]; calYear: number; calMonth: number; onClose: () => void }) {
    const [uid, setUid] = useState(users[0]?.id ?? "");
    const [schedules, setSchedules] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ from_date: "", to_date: "", start_hour: 8, start_minute: 0, late_hour: 9, late_minute: 0, end_hour: 17, end_minute: 0, notes: "" });

    const loadSchedules = async (userId: string) => {
        const r = await fetch(`/api/attendance/date-schedule?user_id=${userId}&year=${calYear}&month=${calMonth + 1}`);
        const d = await r.json(); if (d.success) setSchedules(d.data);
    };

    useEffect(() => { if (uid) loadSchedules(uid); }, [uid]);

    const save = async () => {
        if (!form.from_date) return; setSaving(true);
        try {
            const dates: string[] = [], from = new Date(form.from_date), to = form.to_date ? new Date(form.to_date) : from;
            for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) dates.push(d.toISOString().slice(0, 10));
            await Promise.all(dates.map(date => fetch("/api/attendance/date-schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: uid, schedule_date: date, start_hour: form.start_hour, start_minute: form.start_minute, late_hour: form.late_hour, late_minute: form.late_minute, end_hour: form.end_hour, end_minute: form.end_minute, notes: form.notes || null }) })));
            await loadSchedules(uid);
            setForm(f => ({ ...f, from_date: "", to_date: "", notes: "" }));
        } finally { setSaving(false); }
    };

    const del = async (schedule_date: string) => {
        await fetch(`/api/attendance/date-schedule?user_id=${uid}&schedule_date=${schedule_date}`, { method: "DELETE" });
        setSchedules(s => s.filter(x => x.schedule_date !== schedule_date));
    };

    const fmt = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

    return (
        <ModalShell onClose={onClose} headerColor="bg-gradient-to-r from-violet-600 to-purple-700" title="📆 Jadwal Tanggal Spesifik" subtitle="Override jam masuk untuk tanggal / range tertentu"
            footer={<button onClick={onClose} className="w-full h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all duration-200">Tutup</button>}>
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Karyawan</label>
                <select value={uid} onChange={e => setUid(e.target.value)} className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50/60 text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-400/20 transition-all duration-200">
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
                <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 rounded-2xl p-5">
                    <p className="text-xs font-bold text-violet-700 mb-4">Tambah Jadwal Tanggal</p>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Dari Tanggal</label>
                            <input type="date" value={form.from_date} onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))}
                                min={`${calYear}-${String(calMonth + 1).padStart(2, "0")}-01`} max={`${calYear}-${String(calMonth + 1).padStart(2, "0")}-${new Date(calYear, calMonth + 1, 0).getDate()}`}
                                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 transition-all duration-200" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Sampai Tanggal <span className="text-gray-300 normal-case font-normal">(opsional)</span></label>
                            <input type="date" value={form.to_date} onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))}
                                min={form.from_date || `${calYear}-${String(calMonth + 1).padStart(2, "0")}-01`} max={`${calYear}-${String(calMonth + 1).padStart(2, "0")}-${new Date(calYear, calMonth + 1, 0).getDate()}`}
                                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 transition-all duration-200" />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        {[{ label: "Buka Absen", hKey: "start_hour", mKey: "start_minute" }, { label: "Batas Tepat", hKey: "late_hour", mKey: "late_minute" }, { label: "Tutup Absen", hKey: "end_hour", mKey: "end_minute" }].map(({ label, hKey, mKey }) => (
                            <div key={hKey}>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">{label}</label>
                                <div className="flex gap-1 items-center">
                                    <input type="number" min={0} max={23} value={(form as any)[hKey]} onChange={e => setForm(f => ({ ...f, [hKey]: Number(e.target.value) }))} className="w-12 h-10 border border-gray-200 rounded-xl px-1.5 text-sm bg-white focus:outline-none text-center font-mono font-bold transition-all duration-200" />
                                    <span className="text-gray-300 text-sm font-bold">:</span>
                                    <input type="number" min={0} max={59} value={(form as any)[mKey]} onChange={e => setForm(f => ({ ...f, [mKey]: Number(e.target.value) }))} className="w-12 h-10 border border-gray-200 rounded-xl px-1.5 text-sm bg-white focus:outline-none text-center font-mono font-bold transition-all duration-200" />
                                </div>
                            </div>
                        ))}
                    </div>
                    <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Catatan (opsional)"
                        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 mb-3 transition-all duration-200" />
                    {form.from_date && (
                        <div className="bg-white border border-violet-100 rounded-xl px-4 py-2.5 mb-3 text-[11px] text-gray-600">
                            <span className="font-bold text-violet-700">Preview: </span>
                            {form.from_date}{form.to_date && form.to_date !== form.from_date ? ` s/d ${form.to_date}` : ""} ·
                            Buka <span className="font-mono font-bold">{fmt(form.start_hour, form.start_minute)}</span> ·
                            Tepat s/d <span className="font-mono font-bold">{fmt(form.late_hour, form.late_minute)}</span> ·
                            Tutup <span className="font-mono font-bold">{fmt(form.end_hour, form.end_minute)}</span>
                        </div>
                    )}
                    <button onClick={save} disabled={saving || !form.from_date} className="w-full h-10 bg-gradient-to-r from-violet-600 to-purple-700 text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : "💾 Simpan Jadwal Tanggal"}
                    </button>
                </div>
                {schedules.length > 0 ? (
                    <div>
                        <p className="text-xs font-bold text-gray-600 mb-3 uppercase tracking-wide">Jadwal Tersimpan — {MONTH_NAMES[calMonth]} {calYear}</p>
                        <div className="space-y-2">
                            {schedules.map(s => (
                                <div key={s.id} className="bg-white border border-gray-100 rounded-2xl px-5 py-3 flex items-center justify-between shadow-sm hover:shadow-md transition-all duration-200">
                                    <div>
                                        <p className="text-xs font-bold text-gray-800">{new Date(s.schedule_date + "T12:00:00").toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })}</p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">
                                            Buka <span className="font-mono font-bold text-violet-600">{fmt(s.start_hour, s.start_minute)}</span>
                                            {" · "}Tepat s/d <span className="font-mono font-bold text-emerald-600">{fmt(s.late_hour, s.late_minute)}</span>
                                            {" · "}Tutup <span className="font-mono font-bold text-gray-600">{fmt(s.end_hour, s.end_minute)}</span>
                                            {s.notes && <span className="text-gray-400"> · {s.notes}</span>}
                                        </p>
                                    </div>
                                    <button onClick={() => del(s.schedule_date)} className="w-8 h-8 flex items-center justify-center rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-all duration-200 text-lg font-bold flex-shrink-0">×</button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-8 text-gray-300 text-sm">Belum ada jadwal untuk {MONTH_NAMES[calMonth]} {calYear}</div>
                )}
            </div>
        </ModalShell>
    );
}

export default function AttendanceDashboardPage() {
    const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null);
    const [attendances, setAttendances] = useState<Attendance[]>([]);
    const [dayOffs, setDayOffs] = useState<DayOff[]>([]);
    const [dateOffs, setDateOffs] = useState<DateOff[]>([]);
    const [allDateOffs, setAllDateOffs] = useState<DateOff[]>([]);
    const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [filterUser, setFilterUser] = useState("Semua");
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [showDayOffModal, setShowDayOffModal] = useState(false);
    const [showDateOffModal, setShowDateOffModal] = useState(false);

    const calYear = selectedMonth?.year ?? new Date().getFullYear();
    const calMonth = selectedMonth?.month ?? new Date().getMonth();
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [showDateScheduleModal, setShowDateScheduleModal] = useState(false);

    useEffect(() => { getCurrentUserClient().then(u => setCurrentUser(u)); }, []);

    useEffect(() => {
        if (!selectedMonth) return;
        const { year, month } = selectedMonth;
        setLoading(true); setSelectedDate(null); setFilterUser("Semua");
        const tasks = [fetchAttendance(), fetchDayOffs(), fetchDateOffs(year, month), fetchAllDateOffs()];
        if (currentUser?.role === "ADMIN") tasks.push(fetchAllUsers());
        Promise.all(tasks).finally(() => setLoading(false));
    }, [selectedMonth]); // eslint-disable-line

    const fetchAttendance = async () => { try { const r = await fetch("/api/attendance"); const d = await r.json(); if (d.success) setAttendances((d.data || []).map((a: Attendance) => ({ ...a, displayStatus: getDisplayStatus(a) }))); } catch { } };
    const fetchDayOffs = async () => { try { const r = await fetch("/api/attendance/day-off"); const d = await r.json(); if (d.success) setDayOffs(d.data || []); } catch { } };
    const fetchDateOffs = async (year: number, month: number) => { try { const r = await fetch(`/api/attendance/date-off?year=${year}&month=${month + 1}`); const d = await r.json(); if (d.success) setDateOffs(d.data || []); } catch { } };
    const fetchAllDateOffs = async () => { try { const r = await fetch("/api/attendance/date-off"); const d = await r.json(); if (d.success) setAllDateOffs(d.data || []); } catch { } };
    const fetchAllUsers = async () => { try { const r = await fetch("/api/attendance/users"); const d = await r.json(); if (d.success) setAllUsers(d.data || []); } catch { } };

    const dayOffByName = useMemo(() => { const m: Record<string, Set<number>> = {}; dayOffs.forEach(d => { const n = d.users?.name; if (!n) return; if (!m[n]) m[n] = new Set(); m[n].add(d.day_of_week); }); return m; }, [dayOffs]);
    const dateOffByName = useMemo(() => { const m: Record<string, Set<string>> = {}; allDateOffs.forEach(d => { const n = d.users?.name; if (!n) return; if (!m[n]) m[n] = new Set(); m[n].add(d.off_date); }); return m; }, [allDateOffs]);

    const isDayOffForUser = (userName: string, dk: string) => {
        const dow = new Date(dk + "T12:00:00").getDay();
        return (dayOffByName[userName]?.has(dow) ?? false) || (dateOffByName[userName]?.has(dk) ?? false);
    };
    const getOffUsersForDate = (dk: string) => {
        const dow = new Date(dk + "T12:00:00").getDay();
        const weekly = Object.entries(dayOffByName).filter(([, s]) => s.has(dow)).map(([n]) => n);
        const specific = Object.entries(dateOffByName).filter(([, s]) => s.has(dk)).map(([n]) => n);
        return [...new Set([...weekly, ...specific])];
    };

    const thisMonthKey = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;
    const thisMonthAtt = attendances.filter(a => toWIBDateKey(a.check_in_time || a.created_at).startsWith(thisMonthKey));

    const byDate = useMemo(() => {
        const m: Record<string, Attendance[]> = {};
        const filtered = filterUser === "Semua" ? attendances : attendances.filter(a => a.user_name === filterUser);
        filtered.forEach(a => { const k = toWIBDateKey(a.check_in_time || a.created_at); if (!m[k]) m[k] = []; m[k].push(a); });
        return m;
    }, [attendances, filterUser]);

    const calDays = useMemo(() => {
        const fd = new Date(calYear, calMonth, 1).getDay(), dim = new Date(calYear, calMonth + 1, 0).getDate();
        const c: (number | null)[] = []; for (let i = 0; i < fd; i++) c.push(null); for (let d = 1; d <= dim; d++) c.push(d); return c;
    }, [calYear, calMonth]);

    const todayKey = toWIBDateKey(new Date().toISOString());

    const uniqueUsers = useMemo(() => {
        if (allUsers.length > 0) return allUsers.map(u => u.name).sort();
        return [...new Set(attendances.map(a => a.user_name))].sort();
    }, [allUsers, attendances]);

    const userSummary = useMemo(() => {
        const m: Record<string, { name: string; present: number; late: number; score: number; workdays: number; pct: number }> = {};
        thisMonthAtt.forEach(a => {
            if (!m[a.user_name]) m[a.user_name] = { name: a.user_name, present: 0, late: 0, score: 0, workdays: 0, pct: 0 };
            if (a.displayStatus === "PRESENT") { m[a.user_name].present++; m[a.user_name].score += 1.0; }
            else { m[a.user_name].late++; m[a.user_name].score += 0.5; }
        });
        Object.values(m).forEach(u => {
            const dows = dayOffByName[u.name] ?? new Set();
            const offDts = dateOffByName[u.name] ?? new Set();
            const workdays = countWorkingDays(calYear, calMonth, dows, offDts);
            u.workdays = workdays; u.pct = workdays > 0 ? Math.round((u.score / workdays) * 100) : 0;
        });
        return Object.values(m).sort((a, b) => b.pct - a.pct);
    }, [thisMonthAtt, dayOffByName, dateOffByName, calYear, calMonth]);

    const thisMonthPresent = thisMonthAtt.filter(a => a.displayStatus === "PRESENT").length;
    const thisMonthLate = thisMonthAtt.filter(a => a.displayStatus === "LATE").length;
    const thisMonthDays = new Set(thisMonthAtt.map(a => toWIBDateKey(a.check_in_time || a.created_at))).size;

    if (!selectedMonth) {
        return (
            <DashboardLayout>
                <MonthSelector onSelect={(y, m) => setSelectedMonth({ year: y, month: m })} />
                <style jsx global>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.animate-fadeIn{animation:fadeIn 0.35s ease-out;}`}</style>
            </DashboardLayout>
        );
    }

    const selectedAttendances = selectedDate
        ? (byDate[selectedDate] || []).sort((a, b) => new Date(a.check_in_time).getTime() - new Date(b.check_in_time).getTime())
        : [];

    return (
        <DashboardLayout>
            <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 animate-fadeIn">

                {/* ── Modern Header with Gradient ── */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setSelectedMonth(null)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-all duration-200 shadow-sm hover:shadow-md active:scale-95">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
                                <span className="bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                                    {currentUser?.role === "ADMIN" ? "Laporan Absensi" : "Absensi Saya"}
                                </span>
                                <span className="text-gray-300">—</span>
                                <span className="bg-gradient-to-r from-[#1a1a2e] to-[#16213e] bg-clip-text text-transparent">
                                    {MONTH_NAMES[calMonth]} {calYear}
                                </span>
                            </h1>
                            <p className="text-xs text-gray-400 mt-1">{thisMonthDays} hari hadir · {thisMonthPresent} tepat waktu · {thisMonthLate} terlambat</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {currentUser?.role === "ADMIN" && (<>
                            <button onClick={() => setShowDayOffModal(true)} className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-4 py-2 rounded-xl hover:bg-red-100 hover:shadow-md transition-all duration-200 active:scale-95">📅 Libur Mingguan</button>
                            <button onClick={() => setShowDateOffModal(true)} className="flex items-center gap-1.5 text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 px-4 py-2 rounded-xl hover:bg-orange-100 hover:shadow-md transition-all duration-200 active:scale-95">⚠️ Libur Spesifik</button>
                        </>)}
                        <button onClick={() => { setLoading(true); Promise.all([fetchAttendance(), fetchDayOffs(), fetchDateOffs(calYear, calMonth), fetchAllDateOffs()]).finally(() => setLoading(false)); }} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 px-4 py-2 rounded-xl bg-white hover:shadow-md transition-all duration-200 active:scale-95">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            Refresh
                        </button>
                        <button onClick={() => setShowScheduleModal(true)} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-4 py-2 rounded-xl hover:bg-blue-100 hover:shadow-md transition-all duration-200 active:scale-95">🕐 Jadwal Custom</button>
                        <button onClick={async () => { if (allUsers.length === 0) await fetchAllUsers(); setShowDateScheduleModal(true); }} className="flex items-center gap-1.5 text-xs font-bold text-violet-600 bg-violet-50 border border-violet-200 px-4 py-2 rounded-xl hover:bg-violet-100 hover:shadow-md transition-all duration-200 active:scale-95">📆 Jadwal Tanggal</button>
                    </div>
                </div>

                {/* ── Modern Stat Cards with Gradients ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                        { label: "Hari Hadir",  value: thisMonthDays,    icon: "📅", gradient: "from-gray-50 to-gray-100", iconBg: "bg-gray-100" },
                        { label: "Tepat Waktu", value: thisMonthPresent, icon: "✅", gradient: "from-emerald-50 to-green-100", iconBg: "bg-emerald-100" },
                        { label: "Terlambat",   value: thisMonthLate,    icon: "⏰", gradient: "from-amber-50 to-yellow-100", iconBg: "bg-amber-100" },
                        { label: "Karyawan",    value: uniqueUsers.length, icon: "👥", gradient: "from-blue-50 to-indigo-100", iconBg: "bg-blue-100" },
                    ].map(c => (
                        <div key={c.label} className={`bg-gradient-to-br ${c.gradient} rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 p-5 hover:scale-[1.02]`}>
                            <div className="flex items-start justify-between mb-3">
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">{c.label}</p>
                                <div className={`w-8 h-8 rounded-xl ${c.iconBg} flex items-center justify-center shadow-sm`}>
                                    <span className="text-base">{c.icon}</span>
                                </div>
                            </div>
                            <p className="text-3xl font-black tracking-tight text-gray-800">
                                {loading ? <span className="inline-block w-10 h-8 bg-white/50 rounded-lg animate-pulse" /> : c.value}
                            </p>
                            <p className="text-[10px] text-gray-400 font-medium mt-1">{MONTH_SHORT[calMonth]} {calYear}</p>
                        </div>
                    ))}
                </div>

                {/* ── Filter user (admin) with better design ── */}
                {currentUser?.role === "ADMIN" && (
                    <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-100 shadow-sm p-5">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">🎯 Filter Karyawan</p>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => setFilterUser("Semua")} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${filterUser === "Semua" ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md scale-105" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:shadow-sm"}`}>Semua</button>
                            {uniqueUsers.map(n => (
                                <button key={n} onClick={() => setFilterUser(n)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${filterUser === n ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md scale-105" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:shadow-sm"}`}>{n}</button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Modern Calendar ── */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300">
                    <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                        <div className="flex items-center gap-3">
                            <span className="text-lg font-bold text-gray-800 tracking-tight">{MONTH_NAMES[calMonth]} {calYear}</span>
                            {calYear === new Date().getFullYear() && calMonth === new Date().getMonth() && (
                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full">Bulan ini</span>
                            )}
                        </div>
                        <div className="flex items-center gap-5">
                            <div className="hidden sm:flex items-center gap-4">
                                <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />Tepat</div>
                                <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />Terlambat</div>
                                <div className="flex items-center gap-1.5 text-[11px] text-red-400 font-medium"><span className="w-2.5 h-2.5 rounded-full bg-red-300 animate-pulse" />Libur</div>
                            </div>
                            <button onClick={() => setSelectedMonth(null)} className="text-[11px] text-gray-400 hover:text-[#1a1a2e] transition-all duration-200 font-semibold flex items-center gap-1 hover:gap-2">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                Ganti bulan
                            </button>
                        </div>
                    </div>

                    <div className="p-4 sm:p-6">
                        <div className="grid grid-cols-7 mb-4">
                            {DAY_NAMES.map(d => (
                                <div key={d} className="text-center text-[10px] font-black uppercase py-2 text-gray-400 tracking-widest">{d}</div>
                            ))}
                        </div>

                        {loading ? (
                            <div className="grid grid-cols-7 gap-2">
                                {Array(35).fill(0).map((_, i) => <div key={i} className="h-20 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 animate-pulse" />)}
                            </div>
                        ) : (
                            <div className="grid grid-cols-7 gap-2">
                                {calDays.map((day, idx) => {
                                    if (day === null) return <div key={`e-${idx}`} />;
                                    const dk = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                                    const dd = byDate[dk] || [];
                                    const pc = dd.filter(a => a.displayStatus === "PRESENT").length;
                                    const lc = dd.filter(a => a.displayStatus === "LATE").length;
                                    const tot = dd.length;
                                    const isTod = dk === todayKey, isSel = dk === selectedDate;
                                    let isUserDayOff = false, hasAnyDayOff = false;
                                    if (filterUser !== "Semua") isUserDayOff = isDayOffForUser(filterUser, dk);
                                    else hasAnyDayOff = getOffUsersForDate(dk).length > 0;

                                    return (
                                        <button key={day} onClick={() => setSelectedDate(p => p === dk ? null : dk)}
                                            title={isUserDayOff ? `Libur ${filterUser}` : undefined}
                                            className={`relative flex flex-col items-start justify-start p-3 rounded-xl min-h-[80px] transition-all duration-300 ${
                                                isSel ? "bg-gradient-to-br from-[#1a1a2e] to-[#16213e] shadow-xl scale-[1.02] ring-2 ring-[#1a1a2e]/30"
                                                    : isTod ? "bg-gradient-to-br from-blue-50 to-indigo-50 ring-1 ring-blue-200"
                                                        : isUserDayOff && !tot ? "bg-gradient-to-br from-red-50 to-rose-50"
                                                            : tot ? "bg-gray-50/80 hover:bg-gray-100 hover:shadow-md"
                                                                : "hover:bg-gray-50 hover:shadow-sm"
                                            }`}>
                                            {isUserDayOff && filterUser !== "Semua" && <span className={`absolute top-2 right-2 w-2 h-2 rounded-full ${isSel ? "bg-red-300 animate-pulse" : "bg-red-400"}`} />}
                                            {filterUser === "Semua" && hasAnyDayOff && !isSel && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-300 animate-pulse" />}

                                            <span className={`text-base font-black leading-none mb-2 ${isSel ? "text-white" : isTod ? "text-blue-600" : isUserDayOff ? "text-red-500" : "text-gray-800"}`}>{day}</span>

                                            {tot > 0 && (
                                                <div className="flex flex-col gap-1 w-full">
                                                    <div className="flex gap-1">
                                                        {pc > 0 && <div className={`flex-1 h-1.5 rounded-full ${isSel ? "bg-emerald-300" : "bg-emerald-400"} transition-all duration-300`} style={{ width: `${(pc/tot)*100}%` }} />}
                                                        {lc > 0 && <div className={`flex-1 h-1.5 rounded-full ${isSel ? "bg-amber-300" : "bg-amber-400"} transition-all duration-300`} style={{ width: `${(lc/tot)*100}%` }} />}
                                                    </div>
                                                    <span className={`text-[10px] font-bold ${isSel ? "text-white/70" : "text-gray-400"}`}>{tot} hadir</span>
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Enhanced Detail Modal ── */}
                {selectedDate && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fadeIn hover:shadow-lg transition-all duration-300">
                        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
                            <div>
                                <p className="text-lg font-bold text-gray-800">
                                    {new Date(selectedDate + "T12:00:00+07:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                                </p>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    {selectedAttendances.filter(a => a.displayStatus === "PRESENT").length > 0 && (
                                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full">
                                            ✅ {selectedAttendances.filter(a => a.displayStatus === "PRESENT").length} tepat waktu
                                        </span>
                                    )}
                                    {selectedAttendances.filter(a => a.displayStatus === "LATE").length > 0 && (
                                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-3 py-1 rounded-full">
                                            ⏰ {selectedAttendances.filter(a => a.displayStatus === "LATE").length} terlambat
                                        </span>
                                    )}
                                    {(() => { const off = getOffUsersForDate(selectedDate); return off.length > 0 ? (<span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-100 border border-red-200 px-3 py-1 rounded-full">🔴 Libur: {off.slice(0, 3).join(", ")}{off.length > 3 ? ` +${off.length - 3}` : ""}</span>) : null; })()}
                                </div>
                            </div>
                            <button onClick={() => setSelectedDate(null)} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all duration-200">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {selectedAttendances.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16">
                                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                                    <span className="text-3xl opacity-40">📅</span>
                                </div>
                                {(() => { const off = getOffUsersForDate(selectedDate); return off.length > 0 ? (<div className="text-center"><div className="inline-flex items-center gap-1.5 bg-red-100 border border-red-200 text-red-600 text-xs font-bold px-4 py-2 rounded-full mb-3">🔴 Hari Libur</div>{off.map(n => <p key={n} className="text-xs text-red-400 mt-1">• {n}</p>)}</div>) : <p className="text-sm text-gray-400 font-medium">Tidak ada absensi hari ini</p>; })()}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-100 bg-gray-50/50">
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                                            <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Jam Masuk</th>
                                            <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                                            <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Metode</th>
                                            <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Lokasi</th>
                                            <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest hidden lg:table-cell">Perangkat</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {selectedAttendances.map(a => (
                                            <tr key={a.id} className="hover:bg-gray-50/60 transition-colors duration-200">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-[11px] font-black flex-shrink-0 shadow-md ${a.displayStatus === "PRESENT" ? "bg-gradient-to-br from-[#1a1a2e] to-[#16213e]" : "bg-gradient-to-br from-amber-500 to-orange-500"}`}>
                                                            {a.user_name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-gray-800 text-sm">{a.user_name}</p>
                                                            <p className="text-[10px] text-gray-400 font-medium mt-0.5">{a.user_role?.replace(/_/g, " ")}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className="font-mono font-black text-gray-800 text-sm">{toWIBTime(a.check_in_time || a.created_at)}</span>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full border ${a.displayStatus === "PRESENT" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}>
                                                        {a.displayStatus === "PRESENT" ? "✓ Tepat" : "⏰ Terlambat"}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className={`inline-flex items-center text-[10px] font-bold px-3 py-1.5 rounded-full border w-fit ${a.method === "FACE" ? "bg-blue-100 text-blue-600 border-blue-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                                                            {a.method === "FACE" ? "🫦 Wajah" : "✋ Manual"}
                                                        </span>
                                                        {a.user_shift && <span className={`inline-flex items-center text-[10px] font-bold px-3 py-1.5 rounded-full border w-fit ${a.user_shift === "PAGI" ? "bg-amber-100 text-amber-600 border-amber-200" : "bg-indigo-100 text-indigo-600 border-indigo-200"}`}>{a.user_shift === "PAGI" ? "🌅" : "🌆"} {a.user_shift}</span>}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    {a.latitude && a.longitude ? (
                                                        <a href={`https://maps.google.com/?q=${a.latitude},${a.longitude}`} target="_blank" rel="noopener noreferrer"
                                                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-full border no-underline transition-all duration-200 hover:shadow-md ${Math.round(haversine(a.latitude, a.longitude, OFFICE_LAT, OFFICE_LNG)) <= 80 ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-600 border-red-200"}`}>
                                                            📍 {Math.round(haversine(a.latitude, a.longitude, OFFICE_LAT, OFFICE_LNG))}m
                                                        </a>
                                                    ) : <span className="text-[10px] text-gray-200 font-bold">—</span>}
                                                </td>
                                                <td className="px-4 py-4 hidden lg:table-cell">
                                                    <p className="text-[10px] text-gray-400 truncate max-w-[180px] font-mono">{a.device || "—"}</p>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Enhanced Summary Table ── */}
                {currentUser?.role === "ADMIN" && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300">
                        <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                            <p className="text-base font-bold text-gray-800">Ringkasan Kehadiran — {MONTH_NAMES[calMonth]} {calYear}</p>
                            <p className="text-[10px] text-gray-400 mt-1">Persentase = skor hadir ÷ hari kerja wajib · Tepat=1.0 · Terlambat=0.5 · Absen=0</p>
                        </div>

                        {loading ? (
                            <div className="p-6 space-y-3">{Array(5).fill(0).map((_, i) => <div key={i} className="h-14 bg-gray-50 rounded-2xl animate-pulse" />)}</div>
                        ) : userSummary.length === 0 ? (
                            <div className="py-16 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4"><span className="text-3xl opacity-40">📊</span></div>
                                <p className="text-sm text-gray-400 font-medium">Belum ada data kehadiran bulan ini</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-100 bg-gray-50/60">
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-8">#</th>
                                            <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Tepat</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Terlambat</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Absen</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Skor</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Wajib</th>
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[200px]">Persentase</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {userSummary.map((u, i) => {
                                            const absent = Math.max(0, u.workdays - u.present - u.late);
                                            const pctColor = u.pct >= 90 ? "text-emerald-600" : u.pct >= 70 ? "text-amber-600" : "text-red-500";
                                            const barGradient = u.pct >= 90 ? "from-emerald-400 to-green-500" : u.pct >= 70 ? "from-amber-400 to-orange-500" : "from-red-400 to-rose-500";
                                            return (
                                                <tr key={u.name} className="hover:bg-gray-50/60 transition-colors duration-200">
                                                    <td className="px-6 py-4 text-[11px] text-gray-400 font-black">{i + 1}</td>
                                                    <td className="px-4 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-md">
                                                                {u.name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                                                            </div>
                                                            <span className="font-bold text-gray-800">{u.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 text-sm font-black border border-emerald-200 shadow-sm">{u.present}</span>
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        {u.late > 0
                                                            ? <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-amber-100 text-amber-700 text-sm font-black border border-amber-200 shadow-sm">{u.late}</span>
                                                            : <span className="text-gray-200 text-sm font-black">—</span>
                                                        }
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        {absent > 0
                                                            ? <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-red-100 text-red-600 text-sm font-black border border-red-200 shadow-sm">{absent}</span>
                                                            : <span className="text-gray-200 text-sm font-black">—</span>
                                                        }
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        <span className="text-sm font-black text-gray-700">{u.score.toFixed(1)}</span>
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        <span className="text-sm font-bold text-gray-400">{u.workdays}h</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[100px]">
                                                                <div className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-700`} style={{ width: `${Math.min(u.pct, 100)}%` }} />
                                                            </div>
                                                            <span className={`text-sm font-black w-12 text-right flex-shrink-0 ${pctColor}`}>{u.pct}%</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-t border-gray-100 flex items-center gap-6 flex-wrap">
                            <span className="text-[10px] text-gray-500 font-medium flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />Tepat waktu = 1.0 poin</span>
                            <span className="text-[10px] text-gray-500 font-medium flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" />Terlambat = 0.5 poin</span>
                            <span className="text-[10px] text-gray-500 font-medium flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-400" />Tidak hadir = 0 poin</span>
                            <span className="text-[10px] text-gray-400 ml-auto font-medium">Hari libur tidak dihitung sebagai wajib hadir</span>
                        </div>
                    </div>
                )}
            </div>

            {showDayOffModal && currentUser?.role === "ADMIN" && (
                <DayOffModal users={allUsers} dayOffs={dayOffs} onClose={() => setShowDayOffModal(false)} onSaved={() => { fetchDayOffs(); setShowDayOffModal(false); }} />
            )}
            {showDateOffModal && currentUser?.role === "ADMIN" && (
                <DateOffModal users={allUsers} calYear={calYear} calMonth={calMonth} dateOffs={dateOffs} onClose={() => setShowDateOffModal(false)} onSaved={() => { fetchDateOffs(calYear, calMonth); fetchAllDateOffs(); setShowDateOffModal(false); }} />
            )}
            {showScheduleModal && currentUser?.role === "ADMIN" && (
                <ScheduleModal users={allUsers} onClose={() => setShowScheduleModal(false)} />
            )}
            {showDateScheduleModal && currentUser?.role === "ADMIN" && (
                <DateScheduleModal users={allUsers} calYear={calYear} calMonth={calMonth} onClose={() => setShowDateScheduleModal(false)} />
            )}

            <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        .animate-fadeIn { animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-scaleIn { animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
        </DashboardLayout>
    );
}