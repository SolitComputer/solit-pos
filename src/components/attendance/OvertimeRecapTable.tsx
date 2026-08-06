"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { formatOvertimeMinutes } from "@/lib/overtimeEngine";

interface RecapDay {
  no: number;
  date: string;
  in: string | null;
  out: string | null;
  masuk: "Hadir" | "Libur" | "Alpha";
  terlambat_minutes: number;
  lembur_awal_minutes: number;
  lembur_akhir_minutes: number;
  lembur_awal_akhir_minutes: number;
  total_lembur_minutes: number;
  keterangan: string | null; // ✅ NEW
}

interface RecapResponse {
  user: { id: string; name: string; role: string };
  year: number;
  month: number;
  days: RecapDay[];
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}

function fmtDateShort(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

function fmtMinutes(min: number) {
  if (!min || min <= 0) return "—";
  return formatOvertimeMinutes(min);
}

const MASUK_STYLES: Record<RecapDay["masuk"], string> = {
  Hadir: "text-emerald-700",
  Libur: "text-blue-500",
  Alpha: "text-red-600 font-bold",
};

export function OvertimeRecapTable({ userId }: { userId?: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [recap, setRecap] = useState<RecapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      if (userId) params.set("user_id", userId);
      const res = await fetch(`/api/attendance/overtime/recap?${params.toString()}`);
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal memuat rekap"); setRecap(null); return; }
      setRecap(d.data);
    } catch (err: any) {
      setError(err?.message ?? "Kesalahan jaringan");
    } finally {
      setLoading(false);
    }
  }, [year, month, userId]);

  useEffect(() => { load(); }, [load]);

  const changeMonth = (delta: number) => {
    let m = month + delta, y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  };

  // ✅ NEW — total sebulan, dijumlah dari data yang udah ke-fetch (gak perlu hit API lagi)
  const totals = useMemo(() => {
    if (!recap) return null;
    return recap.days.reduce(
      (acc, d) => ({
        terlambat: acc.terlambat + d.terlambat_minutes,
        lemburAwal: acc.lemburAwal + d.lembur_awal_minutes,
        lemburAkhir: acc.lemburAkhir + d.lembur_akhir_minutes,
        lemburAwalAkhir: acc.lemburAwalAkhir + d.lembur_awal_akhir_minutes,
        total: acc.total + d.total_lembur_minutes,
      }),
      { terlambat: 0, lemburAwal: 0, lemburAkhir: 0, lemburAwalAkhir: 0, total: 0 }
    );
  }, [recap]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="font-bold text-sm text-gray-800">
          {recap?.user?.name ?? "Rekap Lembur"} — {String(month).padStart(2, "0")}/{year}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">‹</button>
          <button onClick={() => changeMonth(1)} className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">›</button>
        </div>
      </div>

      {error && <div className="m-4 bg-red-50 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>}

      {loading ? (
        <div className="p-6 space-y-2">
          {Array(8).fill(0).map((_, i) => <div key={i} className="h-8 bg-gray-50 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[820px]">
            <thead>
              <tr className="bg-[#1c3d5a] text-white">
                <th className="px-3 py-2 text-left font-bold">No</th>
                <th className="px-3 py-2 text-left font-bold">Tanggal</th>
                <th className="px-3 py-2 text-left font-bold">In</th>
                <th className="px-3 py-2 text-left font-bold">Out</th>
                <th className="px-3 py-2 text-left font-bold">Masuk</th>
                <th className="px-3 py-2 text-left font-bold">Terlambat</th>
                <th className="px-3 py-2 text-left font-bold">Lembur Awal</th>
                <th className="px-3 py-2 text-left font-bold">Lembur Akhir</th>
                <th className="px-3 py-2 text-left font-bold">Lembur Awal Akhir</th>
                <th className="px-3 py-2 text-left font-bold">Total Lembur</th>
                <th className="px-3 py-2 text-left font-bold">Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {recap?.days.map((day) => (
                <tr key={day.date} className={day.no % 2 === 0 ? "bg-sky-50/70" : "bg-white"}>
                  <td className="px-3 py-2 font-semibold text-gray-700">{day.no}</td>
                  <td className="px-3 py-2 text-gray-600">{fmtDateShort(day.date)}</td>
                  <td className="px-3 py-2 font-mono text-gray-700">{fmtTime(day.in)}</td>
                  <td className="px-3 py-2 font-mono text-gray-700">{fmtTime(day.out)}</td>
                  <td className={`px-3 py-2 font-semibold ${MASUK_STYLES[day.masuk]}`}>{day.masuk}</td>
                  <td className="px-3 py-2 text-gray-700">{fmtMinutes(day.terlambat_minutes)}</td>
                  <td className="px-3 py-2 text-gray-700">{fmtMinutes(day.lembur_awal_minutes)}</td>
                  <td className="px-3 py-2 text-gray-700">{fmtMinutes(day.lembur_akhir_minutes)}</td>
                  <td className="px-3 py-2 text-gray-700">{fmtMinutes(day.lembur_awal_akhir_minutes)}</td>
                  <td className="px-3 py-2 font-bold text-gray-800">{fmtMinutes(day.total_lembur_minutes)}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-[220px] truncate" title={day.keterangan ?? ""}>{day.keterangan ?? "—"}</td>
                </tr>
              ))}
            </tbody>
            {totals && (
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-gray-300">
                  <td className="px-3 py-2 font-black text-gray-700" colSpan={5}>Total</td>
                  <td className="px-3 py-2 font-black text-gray-800">{fmtMinutes(totals.terlambat)}</td>
                  <td className="px-3 py-2 font-black text-gray-800">{fmtMinutes(totals.lemburAwal)}</td>
                  <td className="px-3 py-2 font-black text-gray-800">{fmtMinutes(totals.lemburAkhir)}</td>
                  <td className="px-3 py-2 font-black text-gray-800">{fmtMinutes(totals.lemburAwalAkhir)}</td>
                  <td className="px-3 py-2 font-black text-emerald-700">{fmtMinutes(totals.total)}</td>
                  <td className="px-3 py-2"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}