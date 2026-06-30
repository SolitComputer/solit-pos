"use client";

import { useEffect, useState } from "react";
import { deriveLiveStatus, type LiveOrder } from "@/lib/trackingStatus";

const TONE: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  bad: "bg-red-50 text-red-700 border-red-200",
  idle: "bg-gray-100 text-gray-500 border-gray-200",
};
const DOT: Record<string, string> = {
  ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500", idle: "bg-gray-400",
};

export default function TrackingStatusBadge({ order, compact = false }: { order: LiveOrder; compact?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(iv);
  }, []);
  const s = deriveLiveStatus(order, now);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-bold flex-shrink-0 ${TONE[s.tone]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${DOT[s.tone]} ${s.tone === "ok" ? "animate-pulse" : ""}`} />
      {compact ? s.code : s.label}
    </span>
  );
}