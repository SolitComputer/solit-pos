"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";

type UserInfo = { id: string; name: string; role: string };

type MonthlyOff = {
  id: string;
  user_id: string;
  off_date: string;
  year: number;
  month: number;
  notes: string | null;
  set_by: string | null;
  users?: { id: string; name: string; role: string };
};

// ← FIX: tambah field "note" (tanpa s) karena API return keduanya
type DateOff = {
  id: string;
  user_id: string;
  off_date: string;
  note?: string | null;
  notes?: string | null;
};
type DateWork = { id: string; user_id: string; work_date: string; note?: string | null };

type SwapMode = { weeklyDate: string; dow: number };

type Props = {
  users: UserInfo[];
  calYear: number;
  calMonth: number;
  onClose: () => void;
  onSaved: () => void;
};

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

export function MonthlyOffModal({ users, calYear, calMonth, onClose, onSaved }: Props) {
  const [selectedUserId, setSelectedUserId] = useState<string>(users[0]?.id ?? "");
  const [monthlyOffs, setMonthlyOffs]       = useState<MonthlyOff[]>([]);
  const [weeklyOffs, setWeeklyOffs]         = useState<{ user_id: string; day_of_week: number }[]>([]);
  const [dateOffs, setDateOffs]             = useState<DateOff[]>([]);
  const [dateWorks, setDateWorks]           = useState<DateWork[]>([]);
  const [loading, setLoading]               = useState(false);
  const [saving, setSaving]                 = useState<string | null>(null);
  const [deleting, setDeleting]             = useState<string | null>(null);
  const [error, setError]                   = useState("");
  const [noteInput, setNoteInput]           = useState("");
  const [swapMode, setSwapMode]             = useState<SwapMode | null>(null);

  const apiYear  = calYear;
  const apiMonth = calMonth + 1;

  const fetchOffs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [moRes, woRes, doRes, dwRes] = await Promise.all([
        fetch(`/api/attendance/monthly-off?year=${apiYear}&month=${apiMonth}`),
        fetch(`/api/attendance/day-off`),
        fetch(`/api/attendance/date-off?year=${apiYear}&month=${apiMonth}`),
        fetch(`/api/attendance/date-work?year=${apiYear}&month=${apiMonth}`),
      ]);
      const [moData, woData, doData, dwData] = await Promise.all([
        moRes.json(), woRes.json(), doRes.json(), dwRes.json(),
      ]);

      if (moData.success) setMonthlyOffs(moData.data ?? []);
      else setError(moData.message ?? "Gagal memuat data libur");

      setWeeklyOffs(woData.success ? (woData.data ?? []) : []);
      setDateOffs(doData.success   ? (doData.data ?? []) : []);
      setDateWorks(dwData.success  ? (dwData.data ?? []) : []);
    } catch {
      setError("Gagal memuat data libur");
    } finally {
      setLoading(false);
    }
  }, [apiYear, apiMonth]);

  useEffect(() => { fetchOffs(); }, [fetchOffs]);
  useEffect(() => { setSwapMode(null); setError(""); }, [selectedUserId]);

  const userOffs       = useMemo(() => monthlyOffs.filter(o => o.user_id === selectedUserId), [monthlyOffs, selectedUserId]);
  const usedCount      = userOffs.length;
  const remainingCount = MAX_OFF - usedCount;
  const offDateSet     = useMemo(() => new Set(userOffs.map(o => o.off_date)), [userOffs]);

  const refWeeklyDows = useMemo(
    () => new Set(weeklyOffs.filter(w => w.user_id === selectedUserId).map(w => w.day_of_week)),
    [weeklyOffs, selectedUserId]
  );

  const refDateOffSet = useMemo(
    () => new Set(dateOffs.filter(d => d.user_id === selectedUserId).map(d => d.off_date)),
    [dateOffs, selectedUserId]
  );

  const dateWorkSet = useMemo(
    () => new Set(dateWorks.filter(d => d.user_id === selectedUserId).map(d => d.work_date)),
    [dateWorks, selectedUserId]
  );

  const swapPairMap = useMemo(() => {
    const map: Record<string, string> = {};
    dateWorks.filter(d => d.user_id === selectedUserId).forEach(dw => {
      const note = dw.note ?? "";
      const m1 = note.match(/\[SWAP\] Pengganti: (\d{4}-\d{2}-\d{2})/);
      const m2 = note.match(/\[SWAP:(\d{4}-\d{2}-\d{2})\]/);
      const replacementDate = m1?.[1] ?? m2?.[1];
      if (replacementDate) map[dw.work_date] = replacementDate;
    });
    return map;
  }, [dateWorks, selectedUserId]);

  const calDays = useMemo(() => {
    const firstDow = new Date(calYear, calMonth, 1).getDay();
    const dim      = new Date(calYear, calMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);
    return cells;
  }, [calYear, calMonth]);

  const todayStr = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

  const handleDateClick = async (dateStr: string, dow: number) => {
    if (saving || deleting) return;
    setError("");

    if (swapMode) {
      if (dateStr === swapMode.weeklyDate) { setSwapMode(null); return; }
      if (offDateSet.has(dateStr) || refDateOffSet.has(dateStr)) {
        setError("Hari pengganti tidak boleh yang sudah terdaftar sebagai libur."); return;
      }
      if (refWeeklyDows.has(dow) && !dateWorkSet.has(dateStr)) {
        setError("Hari pengganti tidak boleh hari libur mingguan lain."); return;
      }
      setSaving(dateStr);
      try {
        const res = await fetch("/api/attendance/monthly-off", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "swap",
            user_id: selectedUserId,
            weekly_date: swapMode.weeklyDate,
            replacement_date: dateStr,
            notes: noteInput || null,
          }),
        });
        const data = await res.json();
        if (!data.success) setError(data.message ?? "Gagal menyimpan tukar libur");
        else { setSwapMode(null); setNoteInput(""); await fetchOffs(); onSaved(); }
      } catch { setError("Gagal menyimpan tukar libur"); }
      finally { setSaving(null); }
      return;
    }

    const isSwappedWeekly = refWeeklyDows.has(dow) && dateWorkSet.has(dateStr);
    if (isSwappedWeekly) {
      const replacementDate = swapPairMap[dateStr];
      if (!replacementDate) { setError("Tidak bisa menemukan pasangan swap."); return; }
      setDeleting(dateStr);
      try {
        const res = await fetch(
          `/api/attendance/monthly-off?user_id=${selectedUserId}&weekly_date=${dateStr}&replacement_date=${replacementDate}`,
          { method: "DELETE" }
        );
        const data = await res.json();
        if (!data.success) setError(data.message ?? "Gagal membatalkan tukar libur");
        else { await fetchOffs(); onSaved(); }
      } catch { setError("Gagal membatalkan tukar libur"); }
      finally { setDeleting(null); }
      return;
    }

    if (offDateSet.has(dateStr)) {
      const record = userOffs.find(o => o.off_date === dateStr);
      if (!record) return;
      setDeleting(dateStr);
      try {
        const res = await fetch(`/api/attendance/monthly-off?id=${record.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!data.success) setError(data.message ?? "Gagal menghapus libur");
        else { await fetchOffs(); onSaved(); }
      } catch { setError("Gagal menghapus libur"); }
      finally { setDeleting(null); }
      return;
    }

    if (refWeeklyDows.has(dow) && !dateWorkSet.has(dateStr)) {
      setSwapMode({ weeklyDate: dateStr, dow }); return;
    }

    if (remainingCount <= 0) { setError(`${selectedUser?.name ?? "User"} sudah memiliki ${MAX_OFF} hari libur bulan ini.`); return; }
    if (refDateOffSet.has(dateStr)) return;

    setSaving(dateStr);
    try {
      const res = await fetch("/api/attendance/monthly-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selectedUserId, off_date: dateStr, notes: noteInput || null }),
      });
      const data = await res.json();
      if (!data.success) setError(data.message ?? "Gagal menyimpan libur");
      else { setNoteInput(""); await fetchOffs(); onSaved(); }
    } catch { setError("Gagal menyimpan libur"); }
    finally { setSaving(null); }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-scaleIn">

        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a1a2e] to-[#16213e] px-6 py-5 flex items-start justify-between flex-shrink-0">
          <div>
            <p className="font-bold text-white text-base">📅 Atur Hari Libur</p>
            <p className="text-xs text-white/70 mt-1">
              {MONTH_NAMES[calMonth]} {calYear} · Maks. {MAX_OFF} hari libur per orang
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 flex flex-col">

          {/* Pilih Karyawan */}
          <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Pilih Karyawan ({users.length} orang)
            </label>
            {users.length === 0 ? (
              <p className="text-sm text-gray-400">Tidak ada karyawan yang bisa dikelola</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {users.map(u => {
                  const count    = monthlyOffs.filter(o => o.user_id === u.id).length;
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

          {/* Swap mode banner */}
          {swapMode && (
            <div className="mx-6 mt-4 bg-amber-50 border border-amber-300 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🔄</span>
                <div>
                  <p className="text-xs font-bold text-amber-800">Mode Tukar Libur Aktif</p>
                  <p className="text-[11px] text-amber-600 mt-0.5">
                    Dari: <span className="font-bold">
                      {DAY_FULL[swapMode.dow]}, {new Date(swapMode.weeklyDate + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "long" })}
                    </span>{" "}→ Klik hari pengganti di kalender
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setSwapMode(null); setError(""); }}
                className="text-amber-600 hover:text-amber-800 text-xs font-bold bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-all flex-shrink-0"
              >
                Batal
              </button>
            </div>
          )}

          {/* Error */}
          <div className="px-6 pt-3">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl flex items-center gap-2 mb-3">
                <span>⚠️</span>{error}
              </div>
            )}
          </div>

          {/* Kalender */}
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
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: MAX_OFF }).map((_, i) => (
                      <div key={i} className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center text-[9px] font-black transition-all ${
                        i < usedCount ? "bg-red-500 border-red-500 text-white" : "bg-gray-100 border-gray-200 text-gray-300"
                      }`}>
                        {i < usedCount ? "✕" : ""}
                      </div>
                    ))}
                  </div>
                  <p className={`text-[10px] font-bold ${
                    remainingCount === 0 ? "text-red-500" : remainingCount === 1 ? "text-amber-500" : "text-emerald-600"
                  }`}>
                    {remainingCount === 0 ? "Kuota penuh" : `Sisa ${remainingCount} hari`}
                  </p>
                </div>
              </div>

              {/* Catatan */}
              <div className="mb-4">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Catatan{" "}
                  <span className="text-gray-300 font-normal normal-case">
                    {swapMode ? "(opsional, untuk tukar libur ini)" : "(opsional, untuk libur baru)"}
                  </span>
                </label>
                <input
                  type="text"
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  placeholder={swapMode ? "e.g. Izin keluarga..." : "e.g. Libur lebaran..."}
                  className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition-all"
                />
              </div>

              {/* Kalender grid */}
              {loading ? (
                <div className="grid grid-cols-7 gap-1.5">
                  {Array(35).fill(0).map((_, i) => (
                    <div key={i} className="h-11 rounded-xl bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-7 mb-2">
                    {DAY_SHORT.map(d => (
                      <div key={d} className="text-center text-[9px] font-black uppercase py-1 text-gray-400 tracking-widest">
                        {d}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1.5">
                    {calDays.map((day, idx) => {
                      if (day === null) return <div key={`e-${idx}`} />;

                      const dk  = `${calYear}-${pad2(calMonth + 1)}-${pad2(day)}`;
                      const dow = new Date(dk + "T12:00:00").getDay();

                      const isOff          = offDateSet.has(dk);
                      const isDateOffRef   = refDateOffSet.has(dk);
                      const isWeeklyDay    = refWeeklyDows.has(dow);
                      const isSwapped      = isWeeklyDay && dateWorkSet.has(dk);
                      const isWeeklyActive = isWeeklyDay && !isSwapped;
                      const isToday        = dk === todayStr;
                      const isBusy         = saving === dk || deleting === dk;
                      const isSwapSource   = swapMode?.weeklyDate === dk;

                      const isSwapTarget = swapMode !== null
                        && dk !== swapMode.weeklyDate
                        && !isOff
                        && !isDateOffRef
                        && !isWeeklyActive;

                      // ── KUNCI: check note DAN notes karena DB punya dua kolom ──
                      const dateOffRecord  = dateOffs.find(d => d.user_id === selectedUserId && d.off_date === dk);
                      const dateOffNoteText = (dateOffRecord?.notes ?? "") || (dateOffRecord?.note ?? "");
                      const isReplacementOff = isDateOffRef && dateOffNoteText.includes("[SWAP]");

                      const clickable = !isBusy && (
                        (isOff && !swapMode) ||
                        (isSwapped && !swapMode) ||
                        (isWeeklyActive && !swapMode) ||
                        (swapMode !== null && isSwapTarget) ||
                        (!swapMode && !isOff && !isWeeklyActive && !isDateOffRef && remainingCount > 0)
                      );

                      return (
                        <button
                          key={day}
                          onClick={() => clickable && handleDateClick(dk, dow)}
                          disabled={!clickable || isBusy}
                          title={
                            isBusy             ? "Loading..."
                            : isSwapSource     ? "Tanggal asal tukar — klik Batal untuk membatalkan"
                            : isSwapped        ? `Sudah ditukar → klik untuk undo (pengganti: ${swapPairMap[dk] ?? "?"})`
                            : isWeeklyActive && !swapMode ? "Libur Mingguan — klik untuk tukar ke hari lain"
                            : isWeeklyActive && swapMode  ? "Tidak bisa pilih hari libur mingguan sebagai pengganti"
                            : isOff            ? `Klik untuk hapus libur ${dk}`
                            : isReplacementOff ? "Hari pengganti tukar libur (read-only)"
                            : isDateOffRef     ? "Libur Tukar (dari menu lain) — read-only"
                            : swapMode         ? "Klik untuk set sebagai hari pengganti"
                            : remainingCount <= 0 ? "Kuota libur penuh"
                            : `Klik untuk set libur ${dk}`
                          }
                          className={`
                            relative flex flex-col items-center justify-center h-11 rounded-xl text-xs font-bold transition-all duration-200
                            ${isBusy ? "opacity-50 cursor-wait" : ""}
                            ${isSwapSource
                              ? "bg-amber-400 text-white shadow-md scale-105 ring-2 ring-amber-300 animate-pulse cursor-default"
                              : isSwapped
                                // ← Hari mingguan yang sudah ditukar → tampil PUTIH (jadi masuk)
                                ? "bg-white text-gray-500 border border-gray-200 cursor-pointer hover:bg-gray-50 hover:scale-105"
                                : isOff
                                  // ← Monthly off → MERAH solid
                                  ? "bg-red-500 text-white shadow-md scale-105 ring-2 ring-red-300 hover:bg-red-600 cursor-pointer"
                                  : isReplacementOff
                                    // ← Hari pengganti swap → MERAH (sedikit lebih muda dari monthly off)
                                    ? "bg-red-400 text-white shadow-sm scale-[1.02] ring-1 ring-red-200 cursor-default"
                                    : isDateOffRef
                                      ? "bg-indigo-50 text-indigo-500 border border-indigo-200 cursor-default"
                                      : isWeeklyActive
                                        ? swapMode
                                          ? "bg-indigo-50 text-indigo-300 border border-indigo-100 cursor-not-allowed opacity-40"
                                          : "bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300 hover:scale-105 cursor-pointer"
                                        : swapMode && isSwapTarget
                                          ? dow === 0 || dow === 6
                                            ? "bg-orange-50 text-orange-500 border border-amber-300 hover:bg-amber-100 hover:text-amber-700 hover:scale-105 cursor-pointer ring-1 ring-amber-300"
                                            : "bg-amber-50 text-gray-700 border border-amber-300 hover:bg-amber-100 hover:text-amber-800 hover:scale-105 cursor-pointer ring-1 ring-amber-300"
                                          : isToday
                                            ? "bg-blue-50 text-blue-600 ring-1 ring-blue-200 hover:bg-blue-100 hover:scale-105 cursor-pointer"
                                            : !clickable
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
                              <span className={isOff || isSwapSource || isReplacementOff ? "font-black" : ""}>{day}</span>
                              {isSwapSource     && <span className="text-[8px] mt-0.5 text-white/90 font-normal leading-none">asal</span>}
                              {isSwapped        && <span className="text-[8px] mt-0.5 text-gray-400 font-normal leading-none">masuk ✓</span>}
                              {isOff            && <span className="text-[8px] mt-0.5 text-white/70 font-normal leading-none">libur</span>}
                              {isReplacementOff && <span className="text-[8px] mt-0.5 text-white/80 font-normal leading-none">pengganti</span>}
                              {isDateOffRef && !isReplacementOff && <span className="text-[7px] mt-0.5 text-indigo-400 font-normal leading-none">tukar</span>}
                              {isWeeklyActive && !swapMode && <span className="text-[7px] mt-0.5 text-indigo-400 font-normal leading-none">↔ tukar?</span>}
                              {isToday && !isOff && !isWeeklyActive && !isSwapSource && !isReplacementOff && (
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

              {/* Daftar libur bulanan */}
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
                        <div key={o.id} className="inline-flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl pl-2.5 pr-3 py-2 shadow-sm">
                          <div className="w-7 h-7 rounded-lg bg-red-500 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">
                            {pad2(d.getDate())}
                          </div>
                          <div className="leading-tight">
                            <p className="text-[11px] font-bold text-gray-700">
                              {DAY_FULL[dow]}, {d.toLocaleDateString("id-ID", { day: "numeric", month: "long" })}
                            </p>
                            {o.notes && <p className="text-[9px] text-gray-400 truncate max-w-[120px]">{o.notes}</p>}
                          </div>
                          <button
                            onClick={() => handleDateClick(o.off_date, dow)}
                            disabled={!!deleting || !!saving}
                            className="w-5 h-5 flex items-center justify-center rounded-full text-red-400 hover:bg-red-200 hover:text-red-700 transition-all text-xs font-black disabled:opacity-40"
                            title="Hapus hari libur ini"
                          >×</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Daftar swap aktif */}
              {Object.keys(swapPairMap).length > 0 && (
                <div className="mt-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">
                    Tukar Libur Aktif ({Object.keys(swapPairMap).length})
                  </p>
                  <div className="flex flex-col gap-2">
                    {Object.entries(swapPairMap).map(([weeklyDate, replacementDate]) => {
                      const wd = new Date(weeklyDate + "T12:00:00");
                      const rd = new Date(replacementDate + "T12:00:00");
                      return (
                        <div key={weeklyDate} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 shadow-sm">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-white border border-gray-300 flex items-center justify-center text-gray-500 text-[10px] font-black flex-shrink-0">
                              {pad2(wd.getDate())}
                            </div>
                            <div className="text-[11px] leading-tight min-w-0">
                              <p className="font-bold text-gray-500 line-through truncate">
                                {DAY_FULL[wd.getDay()]}, {wd.toLocaleDateString("id-ID", { day: "numeric", month: "long" })}
                              </p>
                              <p className="text-[9px] text-gray-400">masuk ✓ (libur dialihkan)</p>
                            </div>
                            <span className="text-gray-300 font-bold mx-1">→</span>
                            <div className="w-7 h-7 rounded-lg bg-red-400 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">
                              {pad2(rd.getDate())}
                            </div>
                            <div className="text-[11px] leading-tight min-w-0">
                              <p className="font-bold text-gray-700 truncate">
                                {DAY_FULL[rd.getDay()]}, {rd.toLocaleDateString("id-ID", { day: "numeric", month: "long" })}
                              </p>
                              <p className="text-[9px] text-red-400 font-semibold">libur pengganti</p>
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              setDeleting(weeklyDate);
                              setError("");
                              try {
                                const res = await fetch(
                                  `/api/attendance/monthly-off?user_id=${selectedUserId}&weekly_date=${weeklyDate}&replacement_date=${replacementDate}`,
                                  { method: "DELETE" }
                                );
                                const data = await res.json();
                                if (!data.success) setError(data.message ?? "Gagal undo swap");
                                else { await fetchOffs(); onSaved(); }
                              } catch { setError("Gagal undo swap"); }
                              finally { setDeleting(null); }
                            }}
                            disabled={!!deleting || !!saving}
                            className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full text-emerald-400 hover:bg-emerald-200 hover:text-emerald-700 transition-all text-sm font-black disabled:opacity-40 ml-1"
                            title="Batalkan tukar libur ini"
                          >×</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-white/95">
          <div className="flex items-center gap-3 flex-wrap text-[10px] text-gray-400 mb-3">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-red-500 inline-block" /> Libur bulanan
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-red-400 inline-block" /> Libur pengganti
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-indigo-50 border border-indigo-200 inline-block" /> Libur mingguan
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-white border border-gray-200 inline-block" /> Sudah ditukar → masuk
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-amber-400 inline-block" /> Asal tukar
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