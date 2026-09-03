"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Check, Loader2, Lock, ShoppingBag } from "lucide-react";
import { getInitials } from "@/lib/roleMeta";
import SolitBorder from "@/components/solit-coins/SolitBorder";
import type { BorderInfo, BorderTier } from "@/lib/solit-coins/types";

type ShopBorder = BorderInfo & { owned: boolean; equipped: boolean };

const TIER_META: Record<BorderTier, { label: string; color: string }> = {
  COMMON: { label: "Common", color: "#64748b" },
  RARE: { label: "Rare", color: "#0891b2" },
  EPIC: { label: "Epic", color: "#7c3aed" },
  LEGENDARY: { label: "Legendary", color: "#d97706" },
  LIMITED: { label: "Limited / Event", color: "#db2777" },
};

const TIER_ORDER: BorderTier[] = ["COMMON", "RARE", "EPIC", "LEGENDARY", "LIMITED"];

export default function BorderShop() {
  const [borders, setBorders] = useState<ShopBorder[]>([]);
  const [balance, setBalance] = useState(0);
  const [unlimited, setUnlimited] = useState(false);
  const [me, setMe] = useState<{ name: string; photo: string | null }>({ name: "", photo: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [shopRes, meRes] = await Promise.all([
        fetch("/api/coins/shop").then((r) => r.json()),
        fetch("/api/auth/me").then((r) => r.json()),
      ]);
      if (shopRes.success) {
        setBorders(shopRes.data.borders);
        setBalance(shopRes.data.balance);
        setUnlimited(!!shopRes.data.unlimited);
        const equipped = shopRes.data.borders.find((b: ShopBorder) => b.equipped);
        setPreviewId((prev) => prev ?? equipped?.id ?? null);
        setError(null);
      } else {
        setError(shopRes.message ?? "Gagal memuat toko");
      }
      if (meRes.success) {
        setMe({ name: meRes.user.name, photo: meRes.user.profile_photo_url ?? null });
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
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
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

  const preview = borders.find((b) => b.id === previewId) ?? null;

  const avatarInner = (
    <span className="w-24 h-24 rounded-full border-4 border-white overflow-hidden bg-slate-100 flex items-center justify-center text-white text-2xl font-black"
      style={{ background: me.photo ? undefined : "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
      {me.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={me.photo} alt={me.name} className="w-full h-full object-cover" />
      ) : (
        getInitials(me.name || "?")
      )}
    </span>
  );

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

      {/* Preview + saldo */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-indigo-50 border border-slate-100 flex flex-col items-center gap-3">
        <SolitBorder style={preview?.style ?? null} thickness={4}>
          {avatarInner}
        </SolitBorder>
        <p className="text-sm font-bold text-slate-700">
          {preview ? preview.name : "Tanpa Border"}
        </p>
        <p className="text-xs text-slate-500">Preview di foto profil kamu</p>
      </div>

      {/* Grid katalog per tier */}
      {TIER_ORDER.map((tier) => {
        const items = borders.filter((b) => b.tier === tier);
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map((b) => {
                const isBusy = busy === b.id;
                const canAfford = unlimited || balance >= b.price_sc;
                return (
                  <div
                    key={b.id}
                    onClick={() => setPreviewId(b.id)}
                    className={`p-3 rounded-2xl bg-white border shadow-sm flex flex-col items-center gap-2 cursor-pointer transition-all ${
                      previewId === b.id ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-100 hover:border-slate-200"
                    }`}
                  >
                    <SolitBorder style={b.style} thickness={3}>
                      <span className="w-12 h-12 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 overflow-hidden">
                        {me.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={me.photo} alt="" className="w-full h-full object-cover" />
                        ) : (
                          getInitials(me.name || "?")
                        )}
                      </span>
                    </SolitBorder>
                    <p className="text-[11px] font-bold text-slate-700 text-center leading-tight">{b.name}</p>

                    {b.equipped ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); act("/api/coins/shop/equip", { borderId: null }, b.id); }}
                        disabled={isBusy}
                        className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" /> Terpasang</>}
                      </button>
                    ) : b.owned ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); act("/api/coins/shop/equip", { borderId: b.id }, b.id); }}
                        disabled={isBusy}
                        className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                      >
                        {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Pasang"}
                      </button>
                    ) : !b.is_purchasable ? (
                      <div className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-slate-50 text-slate-400 border border-slate-100">
                        <Lock className="w-3.5 h-3.5" /> Event
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); act("/api/coins/shop/purchase", { borderId: b.id }, b.id); }}
                        disabled={isBusy || !canAfford}
                        title={canAfford ? "" : "Saldo tidak cukup"}
                        className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400 pt-1">
        <ShoppingBag className="w-3.5 h-3.5" /> Kumpulkan Solit Coins dari misi harian untuk membeli border.
      </p>
    </div>
  );
}
