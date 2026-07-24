// src/components/layout/DashboardLayout.tsx
"use client";

import Sidebar from "./Sidebar";
import { usePresence } from "@/hooks/usePresence";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import DeliveryAlertListener from "../preparation/DeliveryAlertListener";
import { HTCallProvider } from "@/contexts/HTCallContext";
import ConfirmDialog from "../ui/ConfirmDialog";
import { BirthdayBanner } from "@/components/ui/BirthdayBanner";
import { MissionSoundNotifier } from "@/components/layout/MissionSoundNotifier";
import { useMissionSound } from "@/hooks/useMissionSound";
import { SellerReminderNotifier } from "@/components/layout/SellerReminderNotifier";
import { unlockReminderAudio } from "@/lib/reminderSound";
import PatchNoteFab from "@/components/ui/PatchNoteFab";

function ScrollRestorer() {
  const pathname = usePathname();
  const positions = useRef<Record<string, number>>({});
  const isFirstVisit = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const saved = positions.current[pathname];
    const firstVisit = !isFirstVisit.current[pathname];

    if (firstVisit) {
      isFirstVisit.current[pathname] = true;
      window.scrollTo({ top: 0, behavior: "instant" });
    } else if (saved !== undefined) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: saved, behavior: "instant" });
      });
    }

    const handleScroll = () => { positions.current[pathname] = window.scrollY; };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [pathname]);

  return null;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  usePresence();

  // ── userId untuk sound notifier ────────────────────────────────────────────
  // Ikuti pola MissionQuestTracker yang sudah proven: fetch /api/auth/me
  const [soundUserId, setSoundUserId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(r => setSoundUserId(r?.user?.id ?? r?.data?.id ?? r?.id ?? null))
      .catch(() => { });
  }, []);

  // ── Mission sound ──────────────────────────────────────────────────────────
  const { playMissionSound, unlockAudio } = useMissionSound();

  // Ref untuk hindari stale closure di event handler
  const unlockRef = useRef(unlockAudio);
  useEffect(() => { unlockRef.current = unlockAudio; }, [unlockAudio]);

  return (
    <HTCallProvider>
      {/*
       * onClick / onKeyDown / onTouchStart → unlock AudioContext.
       * Interaksi pertama user di mana saja dalam dashboard
       * akan membuka kunci autoplay browser.
       */}
      <div
        className="flex min-h-screen bg-[#F7F7F8]"
        onClick={() => { void unlockRef.current(); unlockReminderAudio(); }}
        onKeyDown={() => { void unlockRef.current(); unlockReminderAudio(); }}
        onTouchStart={() => { void unlockRef.current(); unlockReminderAudio(); }}
      >
        <ScrollRestorer />
        <Sidebar />
        <DeliveryAlertListener />

        <MissionSoundNotifier
          userId={soundUserId}
          unlockAudio={unlockAudio}
          playMissionSound={playMissionSound}
        />

        <SellerReminderNotifier userId={soundUserId} />
        <PatchNoteFab />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile topbar */}
          <div className="lg:hidden h-12 bg-white border-b border-gray-100 flex items-center px-4 flex-shrink-0 sticky top-0 z-30">
            <div className="w-9" />
            <span className="text-sm font-bold text-[#1a1a2e] tracking-tight mx-auto">
              Solit POS
            </span>
            <div className="w-9" />
          </div>

          <main className="flex-1">
            <BirthdayBanner />
            <div className="p-4 lg:p-5 max-w-[1280px]">
              {children}
            </div>
          </main>
        </div>
      </div>

      <ConfirmDialog />
    </HTCallProvider>
  );
}