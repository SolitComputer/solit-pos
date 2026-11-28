"use client";
import { useEffect, useMemo, useState } from "react";
import { X, Eye, Store, Layers, Loader2, AlertTriangle } from "lucide-react";

interface BreakdownRow {
  brand: string;
  platform: string;
  account: string;
  total: number;
}

interface Props {
  from: string;
  to: string;
  periodLabel: string;
  onClose: () => void;
}

export default function AwarenessBreakdownModal({ from, to, periodLabel, onClose }: Props) {
  const [view, setView] = useState<"brand" | "platform">("brand");
  const [rows, setRows] = useState<BreakdownRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setError("");
        const params = new URLSearchParams();
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const res = await fetch(`/api/data-analyst/awareness-breakdown?${params}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || "Gagal");
        setRows(json.data.breakdown as BreakdownRow[]);
        setTotal(json.data.total);
      } catch (err: any) { setError(err.message); } finally { setLoading(false); }
    })();
  }, [from, to]);

  // Group by brand → platform → accounts
  const byBrand = useMemo(() => {
    const map = new Map<string, Map<string, { total: number; accounts: { name: string; total: number }[] }>>();
    for (const r of rows) {
      if (!map.has(r.brand)) map.set(r.brand, new Map());
      const pm = map.get(r.brand)!;
      if (!pm.has(r.platform)) pm.set(r.platform, { total: 0, accounts: [] });
      const entry = pm.get(r.platform)!;
      entry.total += r.total;
      entry.accounts.push({ name: r.account, total: r.total });
    }
    return map;
  }, [rows]);

  // Group by platform → brand → accounts
  const byPlatform = useMemo(() => {
    const map = new Map<string, Map<string, { total: number; accounts: { name: string; total: number }[] }>>();
    for (const r of rows) {
      if (!map.has(r.platform)) map.set(r.platform, new Map());
      const bm = map.get(r.platform)!;
      if (!bm.has(r.brand)) bm.set(r.brand, { total: 0, accounts: [] });
      const entry = bm.get(r.brand)!;
      entry.total += r.total;
      entry.accounts.push({ name: r.account, total: r.total });
    }
    return map;
  }, [rows]);

  const activeGroup = view === "brand" ? byBrand : byPlatform;
  const rootLabel = view === "brand" ? "Toko" : "Platform";
  const childLabel = view === "brand" ? "Platform" : "Toko";
  const RootIcon = view === "brand" ? Store : Layers;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center">
              <Eye className="w-4 h-4 text-white" />
            </span>
            <div>
              <h2 className="font-bold text-gray-900 text-base">Awareness Breakdown</h2>
              <p className="text-xs text-gray-400 mt-0.5">{periodLabel} · Total {total.toLocaleString("id-ID")}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2 tab view */}
        <div className="px-5 pt-3 flex-shrink-0">
          <div className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-full p-1">
            <button onClick={() => setView("brand")}
              className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-semibold ${view === "brand" ? "bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white" : "text-gray-500 hover:bg-white"}`}>
              <Store className="w-3.5 h-3.5" /> Group by Toko
            </button>
            <button onClick={() => setView("platform")}
              className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-semibold ${view === "platform" ? "bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white" : "text-gray-500 hover:bg-white"}`}>
              <Layers className="w-3.5 h-3.5" /> Group by Platform
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </p>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
            </div>
          ) : activeGroup.size === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10">Belum ada data awareness pada periode ini.</p>
          ) : (
            <div className="space-y-3">
              {Array.from(activeGroup.entries())
                .sort((a, b) => {
                  const sumA = Array.from(a[1].values()).reduce((s, v) => s + v.total, 0);
                  const sumB = Array.from(b[1].values()).reduce((s, v) => s + v.total, 0);
                  return sumB - sumA;
                })
                .map(([rootName, children]) => {
                  const rootTotal = Array.from(children.values()).reduce((s, v) => s + v.total, 0);
                  const pct = total > 0 ? ((rootTotal / total) * 100).toFixed(1) : "0.0";
                  return (
                    <div key={rootName} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                      <div className="px-4 py-3 bg-gradient-to-r from-violet-50 to-fuchsia-50 flex items-center justify-between border-b border-violet-100">
                        <div className="flex items-center gap-2 min-w-0">
                          <RootIcon className="w-4 h-4 text-violet-600 flex-shrink-0" />
                          <p className="text-sm font-bold text-gray-900 truncate">{rootName}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] text-violet-700 font-semibold bg-white/70 px-2 py-0.5 rounded-full">{pct}%</span>
                          <span className="text-sm font-bold text-violet-800 tabular-nums">{rootTotal.toLocaleString("id-ID")}</span>
                        </div>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {Array.from(children.entries())
                          .sort((a, b) => b[1].total - a[1].total)
                          .map(([childName, { total: childTotal, accounts }]) => (
                            <div key={childName} className="px-4 py-2.5">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-gray-700">{childLabel}: {childName}</span>
                                <span className="text-xs font-bold text-gray-900 tabular-nums">{childTotal.toLocaleString("id-ID")}</span>
                              </div>
                              <ul className="pl-3 space-y-0.5">
                                {accounts.sort((a, b) => b.total - a.total).map((a, i) => (
                                  <li key={i} className="flex items-center justify-between text-[11px] text-gray-500">
                                    <span className="truncate"><span className="text-gray-300 mr-1">└</span>{a.name}</span>
                                    <span className="tabular-nums font-semibold text-gray-600">{a.total.toLocaleString("id-ID")}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}