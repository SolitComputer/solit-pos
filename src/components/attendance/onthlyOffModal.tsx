// src/components/attendance/MonthlyOffModal.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type UserInfo = {
  id: string;
  name: string;
  role: string;
};

type MonthlyOff = {
  id: string;
  user_id: string;
  off_date: string;    // "YYYY-MM-DD"
  year: number;
  month: number;
  notes: string | null;
  set_by: string | null;
  users?: { id: string; name: string; role: string };
};

type Props = {
  users: UserInfo[];           // bawahan yang boleh dikelola actor
  calYear: number;
  calMonth: number;            // 0-based
  onClose: () => void;
  onSaved: () => void;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_OFF = 4;
const MONTH_NAMES = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];
const DAY_SHORT = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];
const DAY_FULL  = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];

function pad2(n: number) { return String(n).padStart(2, "0"); }

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0] ?? "").join("").toUpperCase();
}

// ─── MonthlyOffModal ──────────────────────────────────────────────────────────
export function MonthlyOffModal({ users, calYear, calMonth, onClose, onSaved }: Props) {
  const [selectedUserId, setSelectedUserId] = useState<string>(users[0]?.id ?? "");
  const [monthlyOffs, setMonthlyOffs]       = useState<MonthlyOff[]>([]);
  const [loading, setLoading]               = useState(false);
  const [saving, setSaving]                 = useState<string | null>(null); // off_date yang sedang disimpan
  const [deleting, setDeleting]             = useState<string | null>(null);
  const [error, setError]                   = useState("");
  const [noteInput, setNoteInput]           = useState("");

  // Tahun & bulan API (1-based month)
  const apiYear  = calYear;
  const apiMonth = calMonth + 1;

  // ── Fetch libur bulan ini untuk semua bawahan ─────────────────────────────
  const fetchOffs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res  = await fetch(`/api/attendance/monthly-off?year=${apiYear}&month=${apiMonth}`);
      const data = await res.json();
      if (data.success) {
        setMonthlyOffs(data.data ?? []);
      } else {
        setError(data.message ?? "Gagal memuat data libur");
      }
    } catch {
      setError("Gagal memuat data libur");
    } finally {
      setLoading(false);
    }
  }, [apiYear, apiMonth]);

  useEffect(() => { fetchOffs(); }, [fetchOffs]);

  // ── Libur untuk user yang sedang dipilih ─────────────────────────────────
  const userOffs = useMemo(
    () => monthlyOffs.filter(o => o.user_id === selectedUserId),
    [monthlyOffs, selectedUserId]
  );

  const usedCount      = userOffs.length;
  const remainingCount = MAX_OFF - usedCount;
  const offDateSet     = useMemo(() => new Set(userOffs.map(o => o.off_date)), [userOffs]);

  // ── Generate kalender ─────────────────────────────────────────────────────
  const calDays = useMemo(() => {
    const firstDow = new Date(calYear, calMonth, 1).getDay();
    const dim      = new Date(calYear, calMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);
    return cells;
  }, [calYear, calMonth]);

  // Lock: bulan lalu tidak bisa diedit
  const nowWIB         = new Date(Date.now() + 7 * 3600_000);
  const currentYM      = nowWIB.getFullYear() * 100 + (nowWIB.getMonth() + 1);
  const targetYM       = calYear * 100 + apiMonth;
  const isPastMonth    = targetYM < currentYM;
  const todayStr       = nowWIB.toISOString().slice(0, 10);

  // ── Toggle tanggal ────────────────────────────────────────────────────────
  const toggleDate = async (dateStr: string) => {
    if (isPastMonth) return;
    if (saving || deleting) return;

    setError("");

    if (offDateSet.has(dateStr)) {
      // Hapus libur
      const record = userOffs.find(o => o.off_date === dateStr);
      if (!record) return;

      setDeleting(dateStr);
      try {
        const res  = await fetch(`/api/attendance/monthly-off?id=${record.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!data.success) {
          setError(data.message ?? "Gagal menghapus libur");
        } else {
          await fetchOffs();
          onSaved();
        }
      } catch {
        setError("Gagal menghapus libur");
      } finally {
        setDeleting(null);
      }
    } else {
      // Tambah libur
      if (remainingCount <= 0) {
        setError(`${selectedUser?.name ?? "User"} sudah memiliki ${MAX_OFF} hari libur bulan ini. Hapus salah satu untuk mengganti.`);
        return;
      }

      setSaving(dateStr);
      try {
        const res  = await fetch("/api/attendance/monthly-off", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: selectedUserId,
            off_date: dateStr,
            notes: noteInput || null,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setError(data.message ?? "Gagal menyimpan libur");
        } else {
          await fetchOffs();
          onSaved();
        }
      } catch {
        setError("Gagal menyimpan libur");
      } finally {
        setSaving(null);
      }
    }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-scaleIn">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-[#1a1a2e] to-[#16213e] px-6 py-5 flex items-start justify-between flex-shrink-0">
          <div>
            <p className="font-bold text-white text-base">📅 Atur Hari Libur</p>
            <p className="text-xs text-white/70 mt-1">
              {MONTH_NAMES[calMonth]} {calYear} · Maksimal {MAX_OFF} hari libur per orang
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 flex flex-col">

          {/* ── Pilih Karyawan ────────────────────────────────────────────── */}
          <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Pilih Karyawan ({users.length} orang)
            </label>
            {users.length === 0 ? (
              <p className="text-sm text-gray-400">Tidak ada karyawan yang bisa dikelola</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {users.map(u => {
                  const offs     = monthlyOffs.filter(o => o.user_id === u.id);
                  const count    = offs.length;
                  const isActive = u.id === selectedUserId;
                  return (
                    <button
                      key={u.id}
                      onClick={() => { setSelectedUserId(u.id); setError(""); }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                        isActive
                          ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white border-[#1a1a2e] shadow-md"
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-black ${
                        isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                      }`}>
                        {initials(u.name)}
                      </span>
                      <span>{u.name}</span>
                      {/* Quota badge */}
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                        count >= MAX_OFF
                          ? "bg-red-500 text-white"
                          : count > 0
                            ? (isActive ? "bg-white/30 text-white" : "bg-blue-100 text-blue-700")
                            : (isActive ? "bg-white/20 text-white/60" : "bg-gray-100 text-gray-400")
                      }`}>
                        {count}/{MAX_OFF}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Error / Info ────────────────────────────────────────────────── */}
          <div className="px-6 pt-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl flex items-center gap-2 mb-3">
                <span>⚠️</span>{error}
              </div>
            )}

            {isPastMonth && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs px-4 py-3 rounded-xl flex items-center gap-2 mb-3">
                <span>🔒</span>
                <span>Bulan yang sudah lewat tidak bisa diedit. Libur hanya bisa diubah untuk bulan ini atau ke depan.</span>
              </div>
            )}
          </div>

          {/* ── Kalender + Info ─────────────────────────────────────────────── */}
          {selectedUser && (
            <div className="px-6 pb-5 flex-1">

              {/* User header + quota */}
              <div className="flex items-center justify-between gap-3 mb-4 bg-gray-50 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[11px] font-black shadow-md">
                    {initials(selectedUser.name)}
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{selectedUser.name}</p>
                    <p className="text-[10px] text-gray-400">{selectedUser.role.replace(/_/g, " ")}</p>
                  </div>
                </div>

                {/* Quota bar */}
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: MAX_OFF }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center text-[9px] font-black transition-all ${
                          i < usedCount
                            ? "bg-red-500 border-red-500 text-white"
                            : "bg-gray-100 border-gray-200 text-gray-300"
                        }`}
                      >
                        {i < usedCount ? "✕" : ""}
                      </div>
                    ))}
                  </div>
                  <p className={`text-[10px] font-bold ${
                    remainingCount === 0 ? "text-red-500" : remainingCount === 1 ? "text-amber-500" : "text-emerald-600"
                  }`}>
                    {remainingCount === 0
                      ? "Kuota penuh"
                      : `Sisa ${remainingCount} hari`}
                  </p>
                </div>
              </div>

              {/* Catatan opsional */}
              {!isPastMonth && (
                <div className="mb-4">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                    Catatan <span className="text-gray-300 font-normal normal-case">(opsional, untuk libur baru)</span>
                  </label>
                  <input
                    type="text"
                    value={noteInput}
                    onChange={e => setNoteInput(e.target.value)}
                    placeholder="e.g. Libur lebaran, izin keluarga..."
                    className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition-all"
                  />
                </div>
              )}

              {/* Kalender */}
              {loading ? (
                <div className="grid grid-cols-7 gap-1.5">
                  {Array(35).fill(0).map((_, i) => (
                    <div key={i} className="h-11 rounded-xl bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : (
                <>
                  {/* Header hari */}
                  <div className="grid grid-cols-7 mb-2">
                    {DAY_SHORT.map(d => (
                      <div key={d} className="text-center text-[9px] font-black uppercase py-1 text-gray-400 tracking-widest">
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Grid tanggal */}
                  <div className="grid grid-cols-7 gap-1.5">
                    {calDays.map((day, idx) => {
                      if (day === null) return <div key={`e-${idx}`} />;

                      const dk         = `${calYear}-${pad2(calMonth + 1)}-${pad2(day)}`;
                      const isOff      = offDateSet.has(dk);
                      const isToday    = dk === todayStr;
                      const isSaving   = saving === dk;
                      const isDeleting = deleting === dk;
                      const isPast     = dk < todayStr && !isOff; // tanggal lalu yang belum di-set libur → tidak bisa diset
                      const isBusy     = isSaving || isDeleting;
                      // Tidak bisa tambah jika: kuota penuh DAN tanggal ini bukan libur
                      const canAdd     = !isOff && remainingCount > 0 && !isPastMonth && !isPast;
                      const canRemove  = isOff && !isPastMonth;
                      const clickable  = (canAdd || canRemove) && !isBusy;

                      const dow = new Date(dk + "T12:00:00").getDay();

                      return (
                        <button
                          key={day}
                          onClick={() => clickable && toggleDate(dk)}
                          disabled={!clickable}
                          title={
                            isOff
                              ? `Klik untuk hapus libur ${dk}`
                              : isPast
                                ? "Tidak bisa set libur untuk tanggal lampau"
                                : isPastMonth
                                  ? "Bulan sudah lewat"
                                  : remainingCount <= 0
                                    ? "Kuota libur sudah penuh"
                                    : `Klik untuk set libur ${dk}`
                          }
                          className={`
                            relative flex flex-col items-center justify-center h-11 rounded-xl text-xs font-bold transition-all duration-200
                            ${isBusy ? "opacity-50 cursor-wait" : ""}
                            ${isOff
                              ? "bg-red-500 text-white shadow-md scale-105 ring-2 ring-red-300"
                              : isToday
                                ? "bg-blue-50 text-blue-600 ring-1 ring-blue-200"
                                : isPast || isPastMonth
                                  ? "bg-gray-50 text-gray-200 cursor-not-allowed"
                                  : !canAdd
                                    ? "bg-gray-50 text-gray-300 cursor-not-allowed"
                                    : dow === 0 || dow === 6
                                      ? "bg-orange-50 text-orange-400 hover:bg-orange-100 hover:scale-105 cursor-pointer"
                                      : "bg-white text-gray-700 border border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 hover:scale-105 cursor-pointer"
                            }
                          `}
                        >
                          {isBusy ? (
                            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <span className={isOff ? "text-white font-black" : ""}>{day}</span>
                              {isOff && <span className="text-[8px] mt-0.5 text-white/70 font-normal leading-none">libur</span>}
                              {isToday && !isOff && (
                                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-400" />
                              )}
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Daftar libur yang sudah diset */}
              {userOffs.length > 0 && (
                <div className="mt-5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">
                    Tanggal Libur ({userOffs.length}/{MAX_OFF})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[...userOffs].sort((a, b) => a.off_date.localeCompare(b.off_date)).map(o => {
                      const d   = new Date(o.off_date + "T12:00:00");
                      const dow = d.getDay();
                      return (
                        <div
                          key={o.id}
                          className="inline-flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl pl-2.5 pr-3 py-2 shadow-sm"
                        >
                          <div className="w-7 h-7 rounded-lg bg-red-500 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">
                            {pad2(d.getDate())}
                          </div>
                          <div className="leading-tight">
                            <p className="text-[11px] font-bold text-gray-700">
                              {DAY_FULL[dow]}, {d.toLocaleDateString("id-ID", { day: "numeric", month: "long" })}
                            </p>
                            {o.notes && (
                              <p className="text-[9px] text-gray-400 truncate max-w-[120px]">{o.notes}</p>
                            )}
                          </div>
                          {!isPastMonth && (
                            <button
                              onClick={() => toggleDate(o.off_date)}
                              disabled={!!deleting || !!saving}
                              className="w-5 h-5 flex items-center justify-center rounded-full text-red-400 hover:bg-red-200 hover:text-red-700 transition-all text-xs font-black disabled:opacity-40"
                              title="Hapus hari libur ini"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-white/95">
          <div className="flex items-center gap-4 flex-wrap text-[10px] text-gray-400 mb-3">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-red-500 inline-block" /> Hari libur (klik untuk hapus)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-white border border-gray-200 inline-block" /> Hari kerja (klik untuk libur)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-orange-50 border border-orange-200 inline-block" /> Akhir pekan
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-full h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all duration-200"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}