import type { ReceiptLineItem } from "@/lib/receiptItems";

/**
 * Tabel item gaya struk Indomaret: keterangan di kiri, nominal di kanan,
 * baris qty x harga satuan kecil di bawah nama barang.
 * Dipakai bareng oleh halaman Nota (/receipt) dan Invoice (/invoice).
 */
export default function ItemsTable({ items }: { items: ReceiptLineItem[] }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i}>
          <div className="flex justify-between items-start gap-3">
            <span className="text-sm text-gray-700 leading-snug flex-1 min-w-0">{it.label}</span>
            <span className="text-sm font-bold text-gray-800 font-mono whitespace-nowrap flex-shrink-0">
              {it.isBonus ? (
                <span className="text-amber-600">Bonus</span>
              ) : (
                `Rp${it.amount.toLocaleString("id-ID")}`
              )}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {it.meta && <span className="text-[10px] font-mono text-gray-400">{it.meta}</span>}
            <span className="text-[11px] text-gray-400 ml-auto whitespace-nowrap">
              {it.qty} x Rp{it.unitPrice.toLocaleString("id-ID")}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}