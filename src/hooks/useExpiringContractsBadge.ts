"use client";

import { useEffect, useState } from "react";
import { CONTRACT_EXPIRING_VIEW_ROLES } from "@/lib/permissions";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // cek tiap 5 menit

export function useExpiringContractsBadge(userRoles: string[], userId?: string | null) {
  const [count, setCount] = useState(0);

  const enabled =
    !!userId &&
    userRoles.some((r) => (CONTRACT_EXPIRING_VIEW_ROLES as string[]).includes(r));

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let active = true;

    const fetchCount = async () => {
      try {
        const res = await fetch("/api/contracts/expiring?count=1", { cache: "no-store" });
        const data = await res.json();
        if (active && data.success) setCount(data.count ?? 0);
      } catch {
        /* diamkan — badge opsional, jangan sampai ganggu sidebar kalau gagal */
      }
    };

    fetchCount();
    const interval = setInterval(fetchCount, POLL_INTERVAL_MS);

    const onFocus = () => fetchCount();
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, userId]);

  return { count };
}