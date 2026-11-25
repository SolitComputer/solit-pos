import { useState, useEffect, useCallback } from "react";
import { hasAnyRole, PARTNER_VIEW_ROLES } from "@/lib/permissions";

/**
 * Hook polling: hitung jumlah pendaftaran Mitra & Reseller yang masih PENDING.
 * Badge senyap (tanpa bunyi) — pola identik usePengajuanDanaBadge.
 */
export function usePartnerPendingBadge(
  userRoles: string[],
  userId: string | null | undefined
) {
  const [count, setCount] = useState(0);

  const canView = hasAnyRole(userRoles, PARTNER_VIEW_ROLES);

  const fetchCount = useCallback(async () => {
    if (!canView || !userId) return;
    try {
      const res = await fetch("/api/partners/pending-count");
      const data = await res.json();
      if (data.success) setCount(data.count ?? 0);
    } catch {
      // silent fail
    }
  }, [canView, userId]);

  useEffect(() => {
    if (!canView || !userId) return;
    fetchCount();
    const interval = setInterval(fetchCount, 60_000); // polling tiap 60 detik
    return () => clearInterval(interval);
  }, [canView, userId, fetchCount]);

  return { count };
}