"use client";

import { useMemo, useState } from "react";
import { pickSchedule, SHIFT_DEFAULTS, type ShiftScheduleRow } from "@/lib/shiftSchedule";

type UserInfo = { id: string; name: string; role: string; shift?: "PAGI" | "SORE" | null };

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const DAY_FULL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const SHIFT_PREVIEW = {
  PAGI: { open: "07:30", late: "08:00", close: "12:00", emoji: "🌅", label: "Pagi" },
  SORE: { open: "14:00", late: "16:00", close: "18:00", emoji: "🌆", label: "Sore" },
} as const;

const pad2 = (n: number) => String(n).padStart(2, "0");
const initials = (n: string) => n.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
const fmtDateLong = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });

export function ShiftScheduleTab({
  users, schedules, calYear, calMonth, onSaved,
}: {
  users: UserInfo[];
  schedules: ShiftScheduleRow[];   // ✅ dari page.tsx — satu sumber kebenaran
  calYear: number;
  calMonth: number;                // 0-indexed
  onSaved: () => void | Promise<void>;
}) {
  const dim = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDow = new Date(calYear, calMonth, 1).getDay();
  const dateKey = (d: number) => `${calYear}-${pad2(calMonth + 1)}-${pad2(d)}`;

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [range, setRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [days, setDays] = useState<number[]>(ALL_DAYS);
  const [shift, setShift] = useState<"PAGI" | "SORE">("PAGI");
  const [useCustomHours, setUseCustomHours] = useState(false);
  const [hours, setHours] = useState({ open: "07:30", late: "08:00", close: "12:00" });
  const [notes, setNotes] = useState("");

  // ── Derived ────────────────────────────────────────────────────────────────
  const filteredUsers = useMemo(
    () => (search
      ? users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()))
      : users),
    [users, search]
  );

  const userById = useMemo(() => {
    const m: Record<string, UserInfo> = {};
    users.forEach(u => { m[u.id] = u; });
    return m;
  }, [users]);

  const schedulesByUser = useMemo(() => {
    const m: Record<string, ShiftScheduleRow[]> = {};
    schedules.forEach(s => { (m[s.user_id] ??= []).push(s); });
    return m;
  }, [schedules]);

  // Tanggal yang sudah punya jadwal untuk user yang sedang dipilih → dot di kalender
  const bookedDates = useMemo(() => {
    const set = new Set<string>();
    if (selectedUsers.length === 0) return set;
    for (let d = 1; d <= dim; d++) {
      const dk = dateKey(d);
      const hit = selectedUsers.some(uid => pickSchedule(schedulesByUser[uid] ?? [], dk) !== null);
      if (hit) set.add(dk);
    }
    return set;
  }, [selectedUsers, schedulesByUser, calYear, calMonth, dim]);

  const inRange = (dk: string) => {
    if (!range.start) return false;
    const end = range.end ?? range.start;
    return dk >= range.start && dk <= end;
  };

  const affectedDates = useMemo(() => {
    if (!range.start) return [];
    const end = range.end ?? range.start;
    const out: string[] = [];
    for (let d = 1; d <= dim; d++) {
      const dk = dateKey(d);
      if (dk < range.start || dk > end) continue;
      if (days.includes(new Date(`${dk}T12:00:00`).getDay())) out.push(dk);
    }
    return out;
  }, [range, days, calYear, calMonth, dim]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const clickDay = (d: number) => {
    const dk = dateKey(d);
    setError("");
    setRange(prev => {
      if (!prev.start || prev.end) return { start: dk, end: null };
      if (dk < prev.start) return { start: dk, end: prev.start };
      return { start: prev.start, end: dk };
    });
  };

  const toggleUser = (id: string) =>
    setSelectedUsers(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const toggleDay = (d: number) =>
    setDays(p => (p.includes(d) ? p.filter(x => x !== d) : [...p, d].sort()));

  const pickShift = (s: "PAGI" | "SORE") => {
    setShift(s);
    if (!useCustomHours) {
      const p = SHIFT_PREVIEW[s];
      setHours({ open: p.open, late: p.late, close: p.close });
    }
  };

  const parseHM = (v: string) => {
    const [h, m] = v.split(":").map(Number);
    return { h: h || 0, m: m || 0 };
  };

  const save = async () => {
    if (selectedUsers.length === 0) return setError("Pilih minimal 1 karyawan");
    if (!range.start) return setError("Pilih rentang tanggal di kalender");
    if (days.length === 0) return setError("Pilih minimal 1 hari");
    if (affectedDates.length === 0) return setError("Tidak ada tanggal yang cocok — cek pilihan hari");

    setSaving(true); setError("");
    try {
      const payload: Record<string, unknown> = {
        user_ids: selectedUsers,
        start_date: range.start,
        end_date: range.end ?? range.start,
        days_of_week: days,
        shift,
        notes: notes || null,
      };

      if (useCustomHours) {
        const o = parseHM(hours.open), l = parseHM(hours.late), c = parseHM(hours.close);
        Object.assign(payload, {
          open_hour: o.h,  open_minute: o.m,
          late_hour: l.h,  late_minute: l.m,
          close_hour: c.h, close_minute: c.m,
        });
      }

      const r = await fetch("/api/attendance/shift-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d.success) { setError(d.message || "Gagal menyimpan"); return; }

      setSelectedUsers([]);
      setRange({ start: null, end: null });
      setNotes("");
      await onSaved();
    } catch {
      setError("Gagal menyimpan jadwal shift");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeleting(id);
    try {
      await fetch(`/api/attendance/shift-schedule?id=${id}`, { method: "DELETE" });
      await onSaved();
    } finally {
      setDeleting(null);
    }
  };

  const cfg = SHIFT_PREVIEW[shift];
  const canSave = selectedUsers.length > 0 && !!range.start && affectedDates.length > 0;

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
          <span>⚠️</span>{error}
        </div>
      )}

      <div className="bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3">
        <p className="text-[11px] font-black text-violet-700 uppercase tracking-wide mb-1">⏰ Cara kerja</p>
        <p className="text-[11px] text-violet-600 leading-relaxed">
          Jadwal ini <strong>menimpa shift default</strong> karyawan — tapi hanya di rentang tanggal & hari yang
          kamu pilih. Di luar itu, shift kembali ke default. Rentang yang lebih sempit menang atas yang lebih lebar.
        </p>
      </div>

      {/* ══ STEP 1 — Karyawan ══ */}
      <section className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <p className="text-[11px] font-black text-gray-500 uppercase tracking-wide">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-lg bg-violet-600 text-white text-[9px] font-black mr-2">1</span>
            Pilih Karyawan
            {selectedUsers.length > 0 && (
              <span className="ml-2 text-violet-600 normal-case">· {selectedUsers.length} dipilih</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama..."
              className="h-8 w-36 border border-gray-200 rounded-xl px-3 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-400/20"
            />
            <button
              type="button"
              onClick={() => setSelectedUsers(
                selectedUsers.length === filteredUsers.length ? [] : filteredUsers.map(u => u.id)
              )}
              className="text-[10px] font-black text-violet-600 hover:text-violet-800 whitespace-nowrap"
            >
              {selectedUsers.length === filteredUsers.length ? "Kosongkan" : "Pilih semua"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
          {filteredUsers.map(u => {
            const sel = selectedUsers.includes(u.id);
            const def = (u.shift ?? "PAGI") as "PAGI" | "SORE";
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleUser(u.id)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left transition-all ${
                  sel
                    ? "bg-violet-600 border-violet-600 text-white shadow-md"
                    : "bg-white border-gray-200 text-gray-600 hover:border-violet-200 hover:bg-violet-50/40"
                }`}
              >
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-black flex-shrink-0 ${
                  sel ? "bg-white/20 text-white" : "bg-gradient-to-br from-violet-400 to-purple-500 text-white"
                }`}>
                  {initials(u.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-black truncate">{u.name}</span>
                  <span className={`block text-[9px] truncate ${sel ? "text-white/60" : "text-gray-400"}`}>
                    default {SHIFT_PREVIEW[def].emoji} {def}
                  </span>
                </span>
              </button>
            );
          })}
          {filteredUsers.length === 0 && (
            <p className="col-span-full text-center text-[11px] text-gray-300 py-6">Tidak ada karyawan cocok</p>
          )}
        </div>
      </section>

      {/* ══ STEP 2 — Kalender rentang tanggal ══ */}
      <section className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <p className="text-[11px] font-black text-gray-500 uppercase tracking-wide">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-lg bg-violet-600 text-white text-[9px] font-black mr-2">2</span>
            Rentang Tanggal
          </p>
          {range.start ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black text-violet-700 bg-violet-50 border border-violet-200 px-3 py-1 rounded-full">
                {fmtDate(range.start)}
                {range.end && range.end !== range.start ? ` → ${fmtDate(range.end)}` : ""}
                {!range.end && " → pilih akhir"}
              </span>
              <button
                onClick={() => setRange({ start: null, end: null })}
                className="text-[10px] font-black text-gray-400 hover:text-red-500"
              >
                Reset
              </button>
            </div>
          ) : (
            <span className="text-[10px] text-gray-400 font-semibold">Klik tanggal awal, lalu tanggal akhir</span>
          )}
        </div>

        <div className="grid grid-cols-7 mb-1.5">
          {DAY_NAMES.map(d => (
            <div key={d} className="text-center text-[9px] font-black uppercase py-1 text-gray-400 tracking-wider">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDow }).map((_, i) => <div key={`e-${i}`} />)}
          {Array.from({ length: dim }, (_, i) => i + 1).map(d => {
            const dk = dateKey(d);
            const dow = new Date(`${dk}T12:00:00`).getDay();
            const active = inRange(dk);
            const isEdge = dk === range.start || dk === range.end;
            const dayOn = days.includes(dow);
            const booked = bookedDates.has(dk);

            return (
              <button
                key={d}
                type="button"
                onClick={() => clickDay(d)}
                title={fmtDateLong(dk)}
                className={`relative h-11 rounded-xl text-[12px] font-black border transition-all ${
                  isEdge
                    ? "bg-gradient-to-br from-violet-600 to-purple-700 text-white border-violet-600 shadow-md scale-[1.04]"
                    : active
                      ? dayOn
                        ? "bg-violet-100 text-violet-700 border-violet-200"
                        : "bg-gray-50 text-gray-300 border-gray-100 line-through"
                      : "bg-white text-gray-600 border-gray-200 hover:bg-violet-50 hover:border-violet-200"
                }`}
              >
                {d}
                {booked && (
                  <span
                    className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${isEdge ? "bg-white/70" : "bg-amber-400"}`}
                    title="Sudah ada jadwal"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 flex-wrap mt-3 text-[9px] text-gray-400 font-semibold">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-violet-600" />Awal / akhir</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-violet-100 border border-violet-200" />Kena jadwal</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-gray-50 border border-gray-200" />Dilewati (hari mati)</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Sudah ada jadwal</span>
        </div>
      </section>

      {/* ══ STEP 3 — Hari + Shift ══ */}
      <section className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-black text-gray-500 uppercase tracking-wide">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-lg bg-violet-600 text-white text-[9px] font-black mr-2">3</span>
              Berlaku di Hari
            </p>
            <button
              type="button"
              onClick={() => setDays(days.length === 7 ? [] : ALL_DAYS)}
              className="text-[10px] font-black text-violet-600 hover:text-violet-800"
            >
              {days.length === 7 ? "Kosongkan" : "Setiap hari"}
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {DAY_NAMES.map((d, dow) => {
              const on = days.includes(dow);
              return (
                <button
                  key={dow}
                  type="button"
                  onClick={() => toggleDay(dow)}
                  title={DAY_FULL[dow]}
                  className={`h-9 rounded-xl text-[11px] font-black border transition-all ${
                    on
                      ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                      : "bg-white text-gray-300 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-black text-gray-500 uppercase tracking-wide mb-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-lg bg-violet-600 text-white text-[9px] font-black mr-2">4</span>
            Shift
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["PAGI", "SORE"] as const).map(s => {
              const p = SHIFT_PREVIEW[s];
              const on = shift === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => pickShift(s)}
                  className={`py-3 rounded-xl border transition-all ${
                    on
                      ? "bg-gradient-to-r from-violet-600 to-purple-700 text-white border-violet-600 shadow-md"
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <span className="block text-xs font-black">{p.emoji} {p.label}</span>
                  <span className={`block text-[9px] font-mono font-bold mt-0.5 ${on ? "text-white/70" : "text-gray-400"}`}>
                    {p.open} – {p.close}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-[11px] font-black text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={useCustomHours}
              onChange={e => {
                setUseCustomHours(e.target.checked);
                if (!e.target.checked) {
                  const p = SHIFT_PREVIEW[shift];
                  setHours({ open: p.open, late: p.late, close: p.close });
                }
              }}
              className="w-4 h-4 rounded accent-violet-600"
            />
            Pakai jam custom
            <span className="text-gray-300 font-semibold normal-case">(override jam default shift)</span>
          </label>

          {useCustomHours && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {([
                ["open", "🟢 Buka", "emerald"],
                ["late", "🟡 Batas Tepat", "amber"],
                ["close", "🔴 Tutup", "red"],
              ] as const).map(([k, label, color]) => (
                <div key={k} className={`bg-${color}-50 border border-${color}-100 rounded-xl p-2.5`}>
                  <label className={`block text-[9px] font-black text-${color}-700 uppercase mb-1.5`}>{label}</label>
                  <input
                    type="time"
                    value={hours[k]}
                    onChange={e => setHours(h => ({ ...h, [k]: e.target.value }))}
                    className="w-full h-8 border border-gray-200 rounded-lg px-2 text-xs font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/20"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wide mb-1.5">
            Catatan <span className="text-gray-300 font-semibold normal-case">(opsional)</span>
          </label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Rotasi shift minggu ke-3"
            className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-400/20"
          />
        </div>
      </section>

      {/* ══ Preview + Simpan ══ */}
      {canSave && (
        <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200 rounded-2xl p-4">
          <p className="text-[10px] font-black text-violet-700 uppercase tracking-wide mb-2.5">📋 Preview</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: "Karyawan", value: `${selectedUsers.length}`, sub: "orang" },
              { label: "Hari Kena", value: `${affectedDates.length}`, sub: "tanggal" },
              { label: "Shift", value: `${cfg.emoji} ${shift}`, sub: `${hours.open}–${hours.close}` },
            ].map(c => (
              <div key={c.label} className="bg-white border border-violet-100 rounded-xl px-3 py-2.5 text-center">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-wide">{c.label}</p>
                <p className="text-sm font-black text-violet-700 mt-0.5">{c.value}</p>
                <p className="text-[9px] text-gray-400 font-semibold">{c.sub}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 mb-3 max-h-16 overflow-y-auto">
            {affectedDates.slice(0, 24).map(dk => (
              <span key={dk} className="text-[9px] font-black bg-white text-violet-600 border border-violet-200 px-2 py-0.5 rounded-lg">
                {fmtDate(dk)}
              </span>
            ))}
            {affectedDates.length > 24 && (
              <span className="text-[9px] font-black text-gray-400 px-2 py-0.5">
                +{affectedDates.length - 24} lagi
              </span>
            )}
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="w-full h-11 bg-gradient-to-r from-violet-600 to-purple-700 text-white rounded-xl text-sm font-black disabled:opacity-50 flex items-center justify-center gap-2 hover:shadow-lg transition-all"
          >
            {saving
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>
              : "⏰ Simpan Jadwal Shift"}
          </button>
        </div>
      )}

      {/* ══ Jadwal aktif ══ */}
      <section>
        <p className="text-[11px] font-black text-gray-500 uppercase tracking-wide mb-3">
          Jadwal Aktif Bulan Ini
          <span className="ml-2 text-violet-600 normal-case">· {schedules.length}</span>
        </p>

        {schedules.length === 0 ? (
          <div className="py-10 text-center bg-gray-50 rounded-2xl border border-gray-100">
            <span className="text-2xl opacity-30">⏰</span>
            <p className="text-[11px] text-gray-400 font-semibold mt-2">Belum ada jadwal shift khusus</p>
            <p className="text-[10px] text-gray-300 mt-0.5">Semua karyawan pakai shift default</p>
          </div>
        ) : (
          <div className="space-y-2">
            {[...schedules]
              .sort((a, b) => a.start_date.localeCompare(b.start_date))
              .map(s => {
                const dows = s.days_of_week ?? ALL_DAYS;
                const everyDay = dows.length === 7;
                const custom = s.open_hour != null;
                const base = SHIFT_DEFAULTS[s.shift];
                const openH = custom ? s.open_hour! : base.open_hour;
                const openM = custom ? (s.open_minute ?? 0) : base.open_minute;
                const closeH = custom ? s.close_hour! : base.close_hour;
                const closeM = custom ? (s.close_minute ?? 0) : base.close_minute;
                const name = (s as any).users?.name ?? userById[s.user_id]?.name ?? "—";

                return (
                  <div key={s.id} className="bg-white border border-gray-100 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">
                        {initials(name)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[12px] font-black text-gray-800 truncate">{name}</p>
                        <p className="text-[10px] text-gray-400 font-semibold truncate">
                          {fmtDate(s.start_date)} – {fmtDate(s.end_date)}
                          {" · "}
                          {everyDay ? "Setiap hari" : dows.map(d => DAY_NAMES[d]).join(", ")}
                        </p>
                        {s.notes && <p className="text-[9px] text-violet-400 font-semibold truncate">📝 {s.notes}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className={`text-right px-2.5 py-1 rounded-xl border ${
                        s.shift === "PAGI"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-indigo-50 text-indigo-700 border-indigo-200"
                      }`}>
                        <p className="text-[10px] font-black leading-none">
                          {SHIFT_PREVIEW[s.shift].emoji} {s.shift}
                        </p>
                        <p className="text-[9px] font-mono font-bold opacity-70 mt-0.5">
                          {pad2(openH)}:{pad2(openM)}–{pad2(closeH)}:{pad2(closeM)}
                        </p>
                      </div>
                      <button
                        onClick={() => remove(s.id)}
                        disabled={deleting === s.id}
                        className="w-8 h-8 flex items-center justify-center rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-all font-black text-lg"
                        title="Hapus jadwal"
                      >
                        {deleting === s.id
                          ? <span className="w-4 h-4 border-2 border-red-300 border-t-red-500 rounded-full animate-spin block" />
                          : "×"}
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}