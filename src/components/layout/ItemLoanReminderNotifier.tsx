"use client";

import { useEffect } from "react";
import { toast } from "sonner";

// Polling tiap 10 menit — cukup karena jadwalnya harian, bukan realtime.
const POLL_INTERVAL_MS = 10 * 60 * 1000;
// Delay fetch pertama supaya tidak tabrakan dengan fetch lain saat page load.
const INITIAL_DELAY_MS = 5000;

interface DueLoan {
  id: string;
  item_name: string;
  serial_number: string | null;
  approved_at: string | null;
  days_since_approved: number | null;
}

export default function ItemLoanReminderNotifier() {
  useEffect(() => {
    let cancelled = false;

    const openLoansPage = () => {
      window.location.href = "/dashboard/item-loans";
    };

    const showReminder = (dueLoans: DueLoan[]) => {
      if (dueLoans.length === 0) return;

      if (dueLoans.length === 1) {
        const l = dueLoans[0];
        const sn = l.serial_number ? ` (${l.serial_number})` : "";
        const ago =
          l.days_since_approved != null ? ` — sudah ${l.days_since_approved} hari` : "";
        toast("Barang pinjaman belum dikembalikan", {
          description: `${l.item_name}${sn}${ago}`,
          duration: 15000,
          action: { label: "Lihat", onClick: openLoansPage },
        });
        return;
      }

      // Lebih dari 1 → gabungkan dalam satu toast.
      toast(`${dueLoans.length} barang masih dalam peminjaman`, {
        description:
          "Jangan lupa untuk mengembalikan barang yang masih menjadi tanggung jawabmu.",
        duration: 15000,
        action: { label: "Lihat", onClick: openLoansPage },
      });
    };

    const check = async () => {
      try {
        const res = await fetch("/api/item-loans/active-reminders", { cache: "no-store" });
        const json = await res.json();
        if (cancelled || !json.success) return;
        showReminder((json.data ?? []) as DueLoan[]);
      } catch {
        /* silent fail — bakal dicek lagi di interval berikutnya */
      }
    };

    const firstCheck = setTimeout(check, INITIAL_DELAY_MS);
    const interval = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(firstCheck);
      clearInterval(interval);
    };
  }, []);

  return null;
}