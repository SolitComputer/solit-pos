"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, X, Target, Palette, ImageIcon } from "lucide-react";
import QuestList from "@/components/solit-coins/QuestList";
import BorderShop from "@/components/solit-coins/BorderShop";
import BannerShop from "@/components/solit-coins/BannerShop";

// Popup Solit Coins (Misi + Toko Border + Toko Banner) — dibuka dari profil.

type Tab = "misi" | "border" | "banner";

export default function SolitCoinsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("misi");
  const [balance, setBalance] = useState<number | null>(null);
  const [unlimited, setUnlimited] = useState(false);

  const loadBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/coins/wallet");
      const json = await res.json();
      if (json.success) {
        setBalance(json.data.balance);
        setUnlimited(!!json.data.unlimited);
      }
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadBalance();
    const h = () => loadBalance();
    window.addEventListener("solit:coins-updated", h);
    return () => window.removeEventListener("solit:coins-updated", h);
  }, [open, loadBalance]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92vh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
          <span
            className="inline-flex items-center justify-center w-10 h-10 rounded-2xl text-white shadow-sm"
            style={{ background: "linear-gradient(135deg,#f59e0b,#fbbf24)" }}
          >
            <Coins className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black text-slate-800 leading-tight">Solit Coins</h2>
            <p className="text-xs text-amber-600 font-bold">
              {balance === null ? "—" : unlimited ? "999.999+" : balance.toLocaleString("id-ID")} SC
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-4 pt-3 flex-shrink-0">
          <div className="flex gap-1.5 p-1 rounded-2xl bg-slate-100">
            <button
              onClick={() => setTab("misi")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all ${
                tab === "misi" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
              }`}
            >
              <Target className="w-4 h-4" /> Misi
            </button>
            <button
              onClick={() => setTab("border")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all ${
                tab === "border" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
              }`}
            >
              <Palette className="w-4 h-4" /> Border
            </button>
            <button
              onClick={() => setTab("banner")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all ${
                tab === "banner" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
              }`}
            >
              <ImageIcon className="w-4 h-4" /> Banner
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === "misi" ? <QuestList /> : tab === "border" ? <BorderShop /> : <BannerShop />}
        </div>
      </div>
    </div>
  );
}
