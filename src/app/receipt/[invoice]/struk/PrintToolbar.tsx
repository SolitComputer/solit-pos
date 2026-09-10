// src/app/receipt/[invoice]/struk/PrintToolbar.tsx
"use client";

import Link from "next/link";

export default function PrintToolbar({ invoice }: { invoice: string }) {
  return (
    <div className="flex items-center gap-3 print:hidden">
      <Link
        href={`/receipt/${invoice}`}
        className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow hover:bg-slate-50 transition"
      >
        ← Kembali ke Nota
      </Link>
      <button
        onClick={() => window.print()}
        className="rounded-xl bg-slate-800 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-slate-900 transition active:scale-[0.98]"
      >
        🖨 Cetak Struk
      </button>
    </div>
  );
}