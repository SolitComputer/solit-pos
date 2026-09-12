"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Check, Loader2, Lock, ImageIcon } from "lucide-react";
import SolitBanner from "@/components/solit-coins/SolitBanner";
import type { BorderInfo, BorderTier } from "@/lib/solit-coins/types";

type ShopBanner = BorderInfo & { owned: boolean; equipped: boolean };

const TIER_META: Record<BorderTier, { label: string; color: string }> = {
  COMMON: { label: "Common", color: "#64748b" },
  RARE: { label: "Rare", color: "#0891b2" },
  EPIC: { label: "Epic", color: "#7c3aed" },
  LEGENDARY: { label: "Legendary", color: "#d97706" },
  LIMITED: { label: "Limited / Event", color: "#db2777" },
};

const TIER_ORDER: BorderTier[] = ["COMMON", "RARE", "EPIC", "LEGENDARY", "LIMITED"];

export default function BannerShop() {
  const [banners, setBanners] = useState<ShopBanner[]>([]);
  const [balance, setBalance] = useState(0);
  const [unlimited, setUnlimited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const json = await fetch("/api/coins/shop").then((r) => r.json());
      if (json.success) {
        setBanners(json.data.banners ?? []);
        setBalance(json.data.balance);
        setUnlimited(!!json.data.unlimited);
        const equipped = (json.data.banners ?? []).find((b: ShopBanner) => b.equipped);
        setPreviewId((prev) => prev ?? equipped?.id ?? null);
        setError(null);
      } else {
        setError(json.message ?? "Gagal memuat toko");
      }
    } catch {
      setError("Gagal memuat toko");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(url: string, body: Record<string, unknown>, id: string) {
    setBusy(id);
    try {
      const json = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());
      if (json.success) {
        window.dispatchEvent(new CustomEvent("solit:coins-updated"));
        window.dispatchEvent(new CustomEvent("solit:border-updated"));
        await load();
      } else {
        setError(json.message ?? "Gagal memproses");
      }
    } catch {
      setError("Gagal memproses");
    } finally {
      setBusy(null);
    }
  }

  const preview = banners.find((b) => b.id === previewId) ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="px-4 py-2.5 rounded-xl text-sm font-medium bg-red-50 text-red-600 border border-red-100">
          {error}
        </div>
      )}

      {/* Preview banner (background contoh = area foto; frame animasi mengelilingi) */}
      <div className="rounded-2xl overflow-hidden border border-slate-100">
        <div
          className="relative h-24 sm:h-28 flex items-center justify-center"
          style={{ background: "linear-gradient(135deg,#334155,#0f172a)" }}
        >
          <span className="text-[11px] text-white/60 font-medium">area foto banner</span>
          {preview && <SolitBanner style={preview.style} thickness={3.5} className="absolute inset-0" />}
        </div>
        <p className="text-center text-sm font-bold text-slate-700 py-2">
          {preview ? preview.name : "Tanpa Banner"}
        </p>
      </div>

      {/* Grid katalog per tier */}
      {TIER_ORDER.map((tier) => {
        const items = banners.filter((b) => b.tier === tier);
        if (items.length === 0) return null;
        const meta = TIER_META[tier];
        return (
          <div key={tier}>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-xs font-black uppercase tracking-wide" style={{ color: meta.color }}>
                {meta.label}
              </span>
              <span className="h-px flex-1" style={{ background: `${meta.color}22` }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map((b) => {
                const isBusy = busy === b.id;
                const canAfford = unlimited || balance >= b.price_sc;
                return (
                  <div
                    key={b.id}
                    onClick={() => setPreviewId(b.id)}
                    className={`rounded-2xl overflow-hidden bg-white border shadow-sm cursor-pointer transition-all ${
                      previewId === b.id ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-100 hover:border-slate-200"
                    }`}
                  >
                    <div className="relative h-14" style={{ background: "linear-gradient(135deg,#334155,#0f172a)" }}>
                      <SolitBanner style={b.style} thickness={2} compact className="absolute inset-0" />
                    </div>
                    <div className="p-2.5 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-bold text-slate-700 truncate">{b.name}</p>
                      {b.equipped ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); act("/api/coins/shop/equip", { borderId: null, type: "BANNER" }, b.id); }}
                          disabled={isBusy}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 disabled:opacity-50 shrink-0"
                        >
                          {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" /> Terpasang</>}
                        </button>
                      ) : b.owned ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); act("/api/coins/shop/equip", { borderId: b.id, type: "BANNER" }, b.id); }}
                          disabled={isBusy}
                          className="px-2 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700 transition-colors shrink-0"
                        >
                          {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Pasang"}
                        </button>
                      ) : !b.is_purchasable ? (
                        <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-slate-50 text-slate-400 border border-slate-100 shrink-0">
                          <Lock className="w-3.5 h-3.5" /> Event
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); act("/api/coins/shop/purchase", { borderId: b.id }, b.id); }}
                          disabled={isBusy || !canAfford}
                          title={canAfford ? "" : "Saldo tidak cukup"}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                          style={
                            canAfford
                              ? { background: "linear-gradient(135deg,#f59e0b,#fbbf24)", color: "#fff" }
                              : { background: "#f1f5f9", color: "#94a3b8" }
                          }
                        >
                          {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Coins className="w-3.5 h-3.5" /> {b.price_sc.toLocaleString("id-ID")}</>}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400 pt-1">
        <ImageIcon className="w-3.5 h-3.5" /> Banner animasi tampil di area banner profilmu.
      </p>
    </div>
  );
}
