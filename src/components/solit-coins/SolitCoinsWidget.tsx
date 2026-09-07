"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, ChevronRight, Sparkles } from "lucide-react";
import type { QuestState } from "@/lib/solit-coins/types";

// Widget ringkas progress misi + saldo. Klik → buka popup Solit Coins (onOpen).

export default function SolitCoinsWidget({ onOpen }: { onOpen: () => void }) {
  const [quests, setQuests] = useState<QuestState[]>([]);
  const [balance, setBalance] = useState(0);
  const [unlimited, setUnlimited] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/coins/quests");
      const json = await res.json();
      if (json.success) {
        setQuests(json.data.quests);
        setBalance(json.data.balance);
        setUnlimited(!!json.data.unlimited);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener("solit:coins-updated", h);
    return () => window.removeEventListener("solit:coins-updated", h);
  }, [load]);

  if (loading) return null;

  const claimable = quests.filter((q) => q.completed && !q.claimed).length;
  const daily = quests.filter((q) => q.periodType === "DAILY").slice(0, 3);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full text-left p-4 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center w-8 h-8 rounded-xl text-white"
            style={{ background: "linear-gradient(135deg,#f59e0b,#fbbf24)" }}
          >
            <Coins className="w-4 h-4" />
          </span>
          <div>
            <p className="text-[11px] text-slate-400 font-semibold leading-none">Solit Coins</p>
            <p className="text-lg font-black text-slate-800 leading-tight">
              {unlimited ? "999.999+" : balance.toLocaleString("id-ID")} <span className="text-xs font-bold text-amber-500">SC</span>
            </p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300" />
      </div>

      {claimable > 0 && (
        <div className="flex items-center gap-1.5 mb-2.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-600 border border-amber-100">
          <Sparkles className="w-3.5 h-3.5" /> {claimable} hadiah siap diklaim!
        </div>
      )}

      <div className="space-y-2">
        {daily.map((q) => {
          const pct = q.target > 0 ? Math.min(100, Math.round((q.progress / q.target) * 100)) : 0;
          return (
            <div key={q.key}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] font-medium text-slate-600 truncate">{q.label}</span>
                <span className="text-[10px] font-semibold text-slate-400 tabular-nums">
                  {q.progress}/{q.target}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: q.claimed
                      ? "linear-gradient(90deg,#10b981,#34d399)"
                      : q.completed
                        ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
                        : "linear-gradient(90deg,#6366f1,#8b5cf6)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </button>
  );
}
