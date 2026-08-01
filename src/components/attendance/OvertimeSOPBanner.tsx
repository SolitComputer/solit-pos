"use client";

import { ShieldAlert } from "lucide-react";
import { OVERTIME_CATEGORY_LABELS, OVERTIME_CATEGORIES } from "@/lib/overtimeEngine";

// Poin 14: pesan SOP wajib tampil di halaman Absen dan Lemburan.
export function OvertimeSOPBanner({ compact }: { compact?: boolean }) {
  return (
    <div className={`bg-amber-50 border border-amber-200 rounded-2xl ${compact ? "px-4 py-3" : "px-5 py-4"} mb-4`}>
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-amber-800 mb-1.5">SOP Lembur — hanya 3 kategori berikut yang diperbolehkan:</p>
          <ol className="space-y-0.5">
            {OVERTIME_CATEGORIES.map((cat, i) => (
              <li key={cat} className="text-[11px] text-amber-700">
                <span className="font-bold">{i + 1}.</span> {OVERTIME_CATEGORY_LABELS[cat]}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}