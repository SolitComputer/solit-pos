"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Check, Loader2, CalendarDays, CalendarRange } from "lucide-react";
import type { QuestState } from "@/lib/solit-coins/types";

// Daftar misi + tombol klaim. Progress dihitung server real-time.

export default function QuestList() {
  const [quests, setQuests] = useState<QuestState[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/coins/quests");
      const json = await res.json();
      if (json.success) {
        setQuests(json.data.quests);
        setError(null);
      } else {
        setError(json.message ?? "Gagal memuat misi");
      }
    } catch {
      setError("Gagal memuat misi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function claim(questKey: string) {
    setClaiming(questKey);
    try {
      const res = await fetch("/api/coins/quests/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questKey }),
      });
      const json = await res.json();
      if (json.success) {
        window.dispatchEvent(new CustomEvent("solit:coins-updated"));
        await load();
      } else {
        setError(json.message ?? "Gagal klaim hadiah");
        await load();
      }
    } catch {
      setError("Gagal klaim hadiah");
    } finally {
      setClaiming(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="px-4 py-2.5 rounded-xl text-sm font-medium bg-red-50 text-red-600 border border-red-100">
          {error}
        </div>
      )}
      {quests.length === 0 && (
        <div className="text-center py-16 text-slate-400 text-sm">
          Belum ada misi untuk role kamu.
        </div>
      )}
      {quests.map((q) => {
        const pct = q.target > 0 ? Math.min(100, Math.round((q.progress / q.target) * 100)) : 0;
        const busy = claiming === q.key;
        return (
          <div
            key={q.key}
            className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={
                    q.periodType === "DAILY"
                      ? { background: "#eef2ff", color: "#4f46e5" }
                      : { background: "#f0fdf4", color: "#16a34a" }
                  }
                >
                  {q.periodType === "DAILY" ? (
                    <CalendarDays className="w-3 h-3" />
                  ) : (
                    <CalendarRange className="w-3 h-3" />
                  )}
                  {q.periodType === "DAILY" ? "Harian" : "Mingguan"}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600">
                  <Coins className="w-3 h-3" />+{q.rewardSc} SC
                </span>
              </div>
              <p className="font-bold text-slate-800 text-sm">{q.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{q.description}</p>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: q.completed
                        ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
                        : "linear-gradient(90deg,#6366f1,#8b5cf6)",
                    }}
                  />
                </div>
                <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                  {q.progress}/{q.target}
                </span>
              </div>
            </div>

            <div className="sm:w-32 shrink-0">
              {q.claimed ? (
                <div className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <Check className="w-4 h-4" /> Diklaim
                </div>
              ) : (
                <button
                  onClick={() => claim(q.key)}
                  disabled={!q.completed || busy}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:scale-105"
                  style={
                    q.completed
                      ? { background: "linear-gradient(135deg,#f59e0b,#fbbf24)", color: "#fff", boxShadow: "0 6px 16px -6px rgba(245,158,11,0.6)" }
                      : { background: "#f1f5f9", color: "#94a3b8" }
                  }
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Coins className="w-4 h-4" /> Klaim Hadiah
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
