// src/components/layout/SellerReminderNotifier.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSellerReminderNotify } from "@/hooks/useSellerReminderNotify";
import { playReminderBeep } from "@/lib/reminderSound";

const BellIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);

export function SellerReminderNotifier({ userId }: { userId: string | null | undefined }) {
  const router = useRouter();
  const { unreadCount, latest, markAllRead, dismissLatest } = useSellerReminderNotify(userId);

  // Mainkan bunyi satu kali setiap ada reminder baru yang masuk realtime
  useEffect(() => {
    if (!latest) return;
    playReminderBeep();
    const t = setTimeout(() => dismissLatest(), 6000);
    return () => clearTimeout(t);
  }, [latest, dismissLatest]);

  if (unreadCount <= 0 && !latest) return null;

  const goToManagementSeller = () => {
    markAllRead();
    router.push("/dashboard/management-seller");
  };

  return (
    <div className="fixed top-3 right-3 z-[80] flex flex-col items-end gap-2 pointer-events-none">
      {/* ── Toast singkat saat reminder baru masuk ── */}
      {latest && (
        <button
          onClick={goToManagementSeller}
          style={{ animation: "solitReminderIn 0.25s ease-out both" }}
          className="pointer-events-auto max-w-[280px] bg-white border border-amber-200 shadow-2xl shadow-amber-900/10 rounded-2xl px-4 py-3 flex items-start gap-2.5 text-left hover:bg-amber-50 transition active:scale-[0.98]"
        >
          <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
            <BellIcon />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-bold text-amber-500 uppercase tracking-wider leading-none mb-1">
              {latest.sent_by_name}
            </span>
            <span className="block text-xs font-semibold text-gray-700 leading-snug">
              {latest.message}
            </span>
          </span>
        </button>
      )}

      {/* ── Badge lonceng persisten selama masih ada reminder belum dibaca ── */}
      {unreadCount > 0 && (
        <button
          onClick={goToManagementSeller}
          title="Ada reminder follow-up dari Admin"
          className="pointer-events-auto relative w-10 h-10 rounded-full bg-[#1a1a2e] text-white shadow-lg shadow-black/20 flex items-center justify-center hover:bg-[#2d2d4a] active:scale-95 transition"
        >
          <BellIcon />
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black tabular-nums">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        </button>
      )}

      <style>{`
        @keyframes solitReminderIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}