// src/components/preparation/DeliveryAlertListener.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/services/supabase";
import { playNotifSound, unlockAudio } from "@/lib/preparationSound";

interface Alert { id: string; order_number: string; customer_name: string }

// Guard global: cegah lebih dari satu subscription aktif walau komponen
// ter-mount ganda (layout dobel / StrictMode / re-render bersamaan).
let ACTIVE_SUB = false;

export default function DeliveryAlertListener() {
  const [userId, setUserId] = useState<string | null>(null);
  const [alert, setAlert] = useState<Alert | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((r) => setUserId(r.user?.id ?? null)).catch(() => {});
  }, []);

  useEffect(() => {
    const unlock = () => { unlockAudio(); window.removeEventListener("pointerdown", unlock); };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    try { seenRef.current = new Set(JSON.parse(localStorage.getItem("deliv_alert_seen") || "[]")); } catch {}
  }, []);

  useEffect(() => {
    if (!userId) return;

    // Kalau sudah ada subscription aktif dari instance lain, jangan bikin lagi.
    if (ACTIVE_SUB) return;
    ACTIVE_SUB = true;

    const channelName = `delivery-assign-alert-${userId}`;

    const ch = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "preparation_orders" },
        (payload) => {
          const row: any = payload.new;
          if (!row) return;
          const assignedToMe = row.delivery_user_id === userId;
          const isDelivering = row.status === "DIKIRIM" && !row.delivered_at;
          if (!assignedToMe || !isDelivering) return;
          if (seenRef.current.has(row.id)) return;

          seenRef.current.add(row.id);
          try { localStorage.setItem("deliv_alert_seen", JSON.stringify([...seenRef.current].slice(-100))); } catch {}

          playNotifSound();
          if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([300, 120, 300, 120, 300]);
          setAlert({ id: row.id, order_number: row.order_number ?? "", customer_name: row.customer_name ?? "Customer" });
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setAlert(null), 12000);
        }
      )
      .subscribe();

    return () => {
      ACTIVE_SUB = false;
      supabase.removeChannel(ch);
    };
  }, [userId]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  if (!alert) return null;
  return (
    <div className="fixed top-4 right-4 z-[200] animate-in slide-in-from-top-2 fade-in duration-300">
      <div className="bg-white border-2 border-violet-300 rounded-2xl shadow-2xl shadow-violet-900/20 px-4 py-3.5 flex items-center gap-3 max-w-sm">
        <div className="w-11 h-11 rounded-xl bg-violet-500 flex items-center justify-center flex-shrink-0 animate-bounce text-xl">🛵</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-gray-900">Kamu ditugaskan mengantar!</p>
          <p className="text-xs text-gray-500 truncate mt-0.5">{alert.customer_name} · {alert.order_number}</p>
          <Link href={`/dashboard/preparation/${alert.id}`} onClick={() => setAlert(null)} className="inline-block mt-1.5 text-xs font-bold text-violet-600 hover:underline">
            Buka & mulai antar →
          </Link>
        </div>
        <button onClick={() => setAlert(null)} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}