"use client";

import Link from "next/link";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useSellerFollowupDueAlert } from "@/hooks/useSellerFollowupDueAlert";

function daysOverdue(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

const MAX_SHOWN = 5;

export default function SellerFollowupBanner() {
  const { user } = useAuthUser();
  const { dueItems, dueCount, forbidden } = useSellerFollowupDueAlert(user?.id ?? null);

  // Bukan PIC / tidak ada yang perlu di-FU → kartu tidak tampil sama sekali
  if (forbidden || dueCount === 0) return null;

  const shown = dueItems.slice(0, MAX_SHOWN);
  const rest = dueCount - shown.length;

  return (
    <div className="rounded-2xl border border-red-200 border-l-4 border-l-red-500 bg-red-50 px-4 py-3.5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-black text-red-700 leading-tight">
              {dueCount} customer belum di-follow-up
            </p>
            <p className="text-[11px] text-red-500 font-medium mt-0.5">
              Segera follow-up. Pengingat berhenti setelah tombol FU ditekan.
            </p>
          </div>
        </div>

        <Link
          href="/dashboard/management-seller"
          className="flex-shrink-0 h-9 px-3.5 inline-flex items-center rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 active:scale-[0.98] transition"
        >
          Follow-up
        </Link>
      </div>

      <ul className="mt-3 space-y-1.5">
        {shown.map((d) => {
          const late = daysOverdue(d.next_followup_at);
          return (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-white/80 border border-red-100 px-3 py-2"
            >
              <span className="text-xs font-bold text-gray-800 truncate">{d.customer_name}</span>
              <span className="text-[10px] font-bold text-red-500 flex-shrink-0 tabular-nums">
                {late <= 0 ? "Hari ini" : `Telat ${late} hari`}
              </span>
            </li>
          );
        })}
      </ul>

      {rest > 0 && (
        <p className="mt-2 text-[11px] font-semibold text-red-500">
          + {rest} customer lainnya
        </p>
      )}
    </div>
  );
}