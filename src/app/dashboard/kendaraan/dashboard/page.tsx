"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Car, CarFront, Inbox, Wrench, Clock, Trophy, Loader2, ArrowLeft, CheckCircle2, History } from "lucide-react";
import { ErrorBanner, formatTime, formatDateTime, formatDuration, liveDurationMinutes } from "@/components/kendaraan/ui";
import { ApproveRequestModal, RejectRequestModal, type ApprovalRequest } from "@/components/kendaraan/ApprovalModals";

type UserLite = { id: string; name: string; role: string };
type Req = {
  id: string;
  requested_at: string;
  actual_start: string | null;
  vehicle?: { name: string } | null;
  borrower?: UserLite | null;
};
type DashboardData = {
  isAdmin: boolean;
  metrics: { totalVehicles: number; inUse: number; pending: number; maintenance: number };
  running: Req[];
  pending: Req[];
  leaderboard: { user_id: string; name: string; total_minutes: number }[];
};
type HistoryReq = {
  id: string;
  actual_end: string | null;
  duration_minutes: number | null;
  return_condition: "BAIK" | "LECET" | "RUSAK" | null;
  vehicle?: { name: string } | null;
  borrower?: UserLite | null;
};

export default function KendaraanDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [history, setHistory] = useState<HistoryReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nowMs, setNowMs] = useState(0);

  const [approveTarget, setApproveTarget] = useState<ApprovalRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ApprovalRequest | null>(null);

  const reload = useCallback(async () => {
    setError("");
    try {
      const [dashRes, histRes] = await Promise.all([
        fetch("/api/vehicles/dashboard", { cache: "no-store" }),
        fetch("/api/vehicles/history", { cache: "no-store" }),
      ]);
      const d = await dashRes.json();
      if (!dashRes.ok || !d.success) throw new Error(d.message || `Error ${dashRes.status}`);
      setData(d);
      const h = await histRes.json();
      if (histRes.ok && h.success) setHistory(h.requests);
    } catch (e: any) {
      setError(e.message || "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Tick durasi live tiap 30 detik (di-set setelah mount -> tidak ada hydration mismatch)
  useEffect(() => {
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const m = data?.metrics;

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F7F7F8]">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f0c29] via-[#150f38] to-[#1a1545] px-5 py-5 sm:px-7 sm:py-6 shadow-lg shadow-violet-950/10 mb-5">
          <div className="relative flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg sm:text-2xl font-black text-white leading-tight">Dashboard Kendaraan</h1>
              <p className="text-[11px] sm:text-xs text-violet-200/80 mt-1">Monitoring pemakaian kendaraan operasional</p>
            </div>
            <Link
              href="/dashboard/kendaraan"
              className="h-10 px-3.5 bg-white/10 hover:bg-white/20 border border-white/15 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
            >
              <ArrowLeft size={15} /> <span className="hidden sm:inline">Kembali</span>
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-4">
            <ErrorBanner msg={error} />
          </div>
        )}

        {loading || !data ? (
          <div className="flex items-center justify-center py-24 text-gray-400 gap-2 text-sm">
            <Loader2 className="animate-spin" size={18} /> Memuat…
          </div>
        ) : (
          <div className="space-y-6">
            {/* Metric cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Total Kendaraan" value={m!.totalVehicles} icon={<Car size={18} />} tone="gray" />
              <StatCard label="Sedang Dipakai" value={m!.inUse} icon={<CarFront size={18} />} tone="violet" />
              <StatCard label="Menunggu ACC" value={m!.pending} icon={<Inbox size={18} />} tone="amber" />
              <StatCard label="Maintenance" value={m!.maintenance} icon={<Wrench size={18} />} tone="emerald" />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Sedang berjalan */}
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-8 h-8 rounded-xl bg-violet-50 border border-violet-200 text-violet-600 flex items-center justify-center">
                    <Clock size={16} />
                  </span>
                  <h2 className="text-sm font-black text-gray-900">Sedang Berjalan ({data.running.length})</h2>
                </div>
                {data.running.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">Tidak ada kendaraan yang sedang dipakai.</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.running.map((r) => (
                      <div key={r.id} className="border border-gray-100 rounded-xl p-3.5 flex items-center justify-between gap-3 bg-gray-50/40">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">{r.vehicle?.name ?? "—"}</p>
                          <p className="text-[10px] text-gray-500 truncate">
                            {r.borrower?.name ?? "—"} · sejak {formatTime(r.actual_start)}
                          </p>
                        </div>
                        <span className="text-[11px] font-black tabular-nums text-violet-600 whitespace-nowrap">
                          {formatDuration(liveDurationMinutes(r.actual_start, nowMs))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Menunggu ACC */}
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
                    <Inbox size={16} />
                  </span>
                  <h2 className="text-sm font-black text-gray-900">Menunggu ACC ({data.pending.length})</h2>
                </div>
                {data.pending.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">Tidak ada pengajuan menunggu.</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.pending.map((r) => (
                      <div key={r.id} className="border border-gray-100 rounded-xl p-3.5 bg-gray-50/40">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-900 truncate">{r.vehicle?.name ?? "—"}</p>
                            <p className="text-[10px] text-gray-500 truncate">{r.borrower?.name ?? "—"}</p>
                          </div>
                        </div>
                        {data.isAdmin ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setApproveTarget(r)}
                              className="flex-1 h-9 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition active:scale-95"
                            >
                              <CheckCircle2 size={13} /> Setujui
                            </button>
                            <button
                              onClick={() => setRejectTarget(r)}
                              className="flex-1 h-9 bg-white border border-red-200 text-red-600 rounded-lg text-[11px] font-semibold hover:bg-red-50 transition active:scale-95"
                            >
                              Tolak
                            </button>
                          </div>
                        ) : (
                          <p className="text-[10px] text-gray-400">Menunggu persetujuan admin</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Leaderboard */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
                  <Trophy size={16} />
                </span>
                <h2 className="text-sm font-black text-gray-900">Leaderboard Pemakaian</h2>
              </div>
              {data.leaderboard.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Belum ada data pemakaian selesai.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.leaderboard.map((u, i) => (
                    <div key={u.user_id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition">
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 ${
                          i === 0
                            ? "bg-amber-100 text-amber-700"
                            : i === 1
                            ? "bg-gray-100 text-gray-600"
                            : i === 2
                            ? "bg-orange-100 text-orange-700"
                            : "bg-gray-50 text-gray-400"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="flex-1 text-xs font-semibold text-gray-800 truncate">{u.name}</span>
                      <span className="text-[11px] font-black tabular-nums text-emerald-600">
                        {formatDuration(u.total_minutes)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Riwayat pemakaian (COMPLETED) */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 flex items-center justify-center">
                  <History size={16} />
                </span>
                <h2 className="text-sm font-black text-gray-900">Riwayat Pemakaian ({history.length})</h2>
              </div>
              {history.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Belum ada riwayat pemakaian.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => (
                    <div key={h.id} className="border border-gray-100 rounded-xl p-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">{h.vehicle?.name ?? "—"}</p>
                        <p className="text-[10px] text-gray-500 truncate">
                          {h.borrower?.name ?? "—"} · {formatDateTime(h.actual_end)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {h.return_condition && <ConditionBadge condition={h.return_condition} />}
                        <span className="text-[11px] font-black tabular-nums text-gray-700">{formatDuration(h.duration_minutes)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {approveTarget && <ApproveRequestModal request={approveTarget} onClose={() => setApproveTarget(null)} onSaved={reload} />}
      {rejectTarget && <RejectRequestModal request={rejectTarget} onClose={() => setRejectTarget(null)} onSaved={reload} />}
    </DashboardLayout>
  );
}

function ConditionBadge({ condition }: { condition: "BAIK" | "LECET" | "RUSAK" }) {
  const map: Record<string, string> = {
    BAIK: "bg-emerald-50 text-emerald-700 border-emerald-200",
    LECET: "bg-amber-50 text-amber-700 border-amber-200",
    RUSAK: "bg-red-50 text-red-600 border-red-200",
  };
  const label: Record<string, string> = { BAIK: "Baik", LECET: "Lecet", RUSAK: "Rusak" };
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border ${map[condition]}`}>
      {label[condition]}
    </span>
  );
}

// ─── STAT CARD (pola dari monitoring Lembur) ─────────────────────────────────
const STAT_TONES: Record<"gray" | "violet" | "emerald" | "amber", { bg: string; text: string; border: string }> = {
  gray: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200" },
  violet: { bg: "bg-violet-50", text: "text-violet-600", border: "border-violet-200" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200" },
  amber: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200" },
};

function StatCard({
  label, value, icon, tone,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone: keyof typeof STAT_TONES;
}) {
  const t = STAT_TONES[tone];
  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 overflow-hidden transition hover:shadow-md hover:-translate-y-0.5">
      <div className="relative flex items-start justify-between gap-2 mb-2">
        <span className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${t.bg} border ${t.border} ${t.text} flex items-center justify-center shrink-0 shadow-sm`}>
          {icon}
        </span>
      </div>
      <div className="relative">
        <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1 truncate">{label}</div>
        <div className="text-xl sm:text-2xl lg:text-3xl font-black tabular-nums text-gray-900 leading-none truncate">{value}</div>
      </div>
    </div>
  );
}
