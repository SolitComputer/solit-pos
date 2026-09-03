"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Coins } from "lucide-react";

// Chip saldo Solit Coins. Refresh saat event global "solit:coins-updated"
// (dipancarkan setelah klaim misi / beli border).

export default function CoinBalanceChip({ className = "" }: { className?: string }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [unlimited, setUnlimited] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/coins/wallet");
        const json = await res.json();
        if (alive && json.success) {
          setBalance(json.data.balance);
          setUnlimited(!!json.data.unlimited);
        }
      } catch {
        /* silent */
      }
    }
    load();
    const handler = () => load();
    window.addEventListener("solit:coins-updated", handler);
    return () => {
      alive = false;
      window.removeEventListener("solit:coins-updated", handler);
    };
  }, []);

  return (
    <Link
      href="/dashboard/profile?solitcoins=1"
      title="Solit Coins"
      onClick={() => window.dispatchEvent(new CustomEvent("solit:open-coins"))}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all hover:scale-105 ${className}`}
      style={{
        background: "linear-gradient(135deg,#fef3c7,#fde68a)",
        color: "#92400e",
        border: "1px solid #fcd34d",
      }}
    >
      <Coins className="w-3.5 h-3.5" />
      <span>{balance === null ? "—" : unlimited ? "999.999+" : balance.toLocaleString("id-ID")}</span>
    </Link>
  );
}
