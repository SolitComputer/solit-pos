"use client";

import type { ReceiptLineItem } from "@/lib/receiptItems";

interface Props {
  items: ReceiptLineItem[];
}

const fmt = (n: number) => "Rp" + (n || 0).toLocaleString("id-ID");

export default function ItemsTable({ items }: Props) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-gray-400 italic">Belum ada rincian barang</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((it, idx) => (
        <div key={idx} className={idx > 0 ? "pt-3 border-t border-dashed border-gray-200" : ""}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 leading-snug">{it.label}</p>
              {it.meta && <p className="text-[11px] text-gray-400 font-mono mt-0.5">{it.meta}</p>}
            </div>
            {it.isBonus && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0 whitespace-nowrap">
                BONUS
              </span>
            )}
          </div>

          {it.officialUnitPrice ? (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-400 line-through font-mono">{fmt(it.officialUnitPrice)}</span>
              {it.hasDiscount && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 border border-red-200">
                  Diskon {it.discountPercent}%
                </span>
              )}
            </div>
          ) : null}

          <div className="flex justify-between items-center mt-1">
            <span className="text-xs text-gray-500">
              {it.qty} x {fmt(it.unitPrice)}
            </span>
            <span className={`text-sm font-bold font-mono ${it.isBonus ? "text-amber-600" : "text-gray-800"}`}>
              {it.isBonus ? "GRATIS" : fmt(it.amount)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}