// src/components/receipt/ThermalReceipt.tsx
// Struk termal gaya Indomaret — KHUSUS untuk print (kertas 80mm).
// Di layar disembunyikan (display:none), hanya muncul saat @media print.
// Reuse helper dari receiptItems.ts biar subtotal/hemat konsisten dgn card & WA.

import type { ReceiptLineItem } from "@/lib/receiptItems";
import { sumLineItems, sumSavings } from "@/lib/receiptItems";

interface ThermalReceiptProps {
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  invoiceNumber: string;
  dateLabel: string;
  cashierName?: string;
  customerName?: string;
  items: ReceiptLineItem[];
  total: number;
  paymentMethod?: string;
  statusLabel?: string;
  warrantyEndLabel?: string;
}

const rp = (n: number) => `Rp${(n || 0).toLocaleString("id-ID")}`;

export default function ThermalReceipt({
  storeName = "SOLIT 03",
  storeAddress = "Sawangan, Depok",
  storePhone,
  invoiceNumber,
  dateLabel,
  cashierName,
  customerName,
  items,
  total,
  paymentMethod,
  statusLabel = "LUNAS",
  warrantyEndLabel,
}: ThermalReceiptProps) {
  const subtotal = sumLineItems(items);
  const savings = sumSavings(items);

  return (
    <div
      className="thermal-print-area font-mono text-black bg-white mx-auto"
      style={{ width: "80mm", padding: "4mm 5mm", fontSize: "11px", lineHeight: 1.45 }}
    >
      {/* Kop toko */}
      <div className="text-center leading-tight">
        <p className="font-bold tracking-wide" style={{ fontSize: "15px" }}>
          {storeName}
        </p>
        <p>{storeAddress}</p>
        {storePhone && <p>{storePhone}</p>}
      </div>

      <Dashed />

      {/* Meta transaksi */}
      <div className="space-y-0.5">
        <Row label="No. Nota" value={invoiceNumber} />
        <Row label="Tanggal" value={dateLabel} />
        {cashierName && <Row label="Kasir" value={cashierName} />}
        {customerName && <Row label="Pelanggan" value={customerName} />}
      </div>

      <Dashed />

      {/* Daftar item */}
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i}>
            <p className="font-semibold leading-snug break-words">{it.label}</p>
            {it.meta && <p className="text-[10px] leading-tight">{it.meta}</p>}
            {it.officialUnitPrice && (
              <p className="text-[10px] leading-tight">
                Normal:{" "}
                <span className="line-through">{rp(it.officialUnitPrice)}</span>
                {it.hasDiscount ? ` (-${it.discountPercent}%)` : ""}
              </p>
            )}
            <div className="flex justify-between">
              <span>
                {it.qty} x {rp(it.unitPrice)}
              </span>
              <span className="font-semibold">
                {it.isBonus ? "BONUS" : rp(it.amount)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <Dashed />

      {/* Total */}
      <div className="space-y-0.5">
        <Row label="Subtotal" value={rp(subtotal)} />
        {savings > 0 && <Row label="Hemat" value={rp(savings)} />}
        <div
          className="flex justify-between font-bold"
          style={{ fontSize: "13px" }}
        >
          <span>TOTAL</span>
          <span>{rp(total)}</span>
        </div>
        {paymentMethod && <Row label="Bayar" value={paymentMethod} />}
        {statusLabel && <Row label="Status" value={statusLabel} />}
      </div>

      {warrantyEndLabel && (
        <>
          <Dashed />
          <Row label="Garansi s/d" value={warrantyEndLabel} />
        </>
      )}

      <Dashed />

      {/* Footer */}
      <div className="text-center leading-tight" style={{ fontSize: "10px" }}>
        <p>Terima kasih telah berbelanja</p>
        <p className="font-semibold">di {storeName}</p>
        <p className="mt-1">Cek garansi & info:</p>
        <p>solit03.com/cek-garansi</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function Dashed() {
  return <div className="my-2" style={{ borderTop: "1px dashed #000", height: 0 }} />;
}