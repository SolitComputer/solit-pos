// src/components/receipt/ThermalReceipt.tsx
// Struk termal gaya Indomaret (dot-matrix) — KHUSUS print (kertas 80mm).
// Disembunyikan di layar (display:none via .thermal-print-area), muncul saat @media print.
// Reuse helper receiptItems.ts biar subtotal/hemat konsisten dgn card & WA.

import type { ReceiptLineItem } from "@/lib/receiptItems";
import { sumLineItems, sumSavings } from "@/lib/receiptItems";

interface ThermalReceiptProps {
  storeName?: string;
  storeAddressLines?: string[];
  storePhone?: string;
  logoSrc?: string;
  invoiceNumber: string;
  dateLabel: string;
  cashierName?: string;
  customerName?: string;
  items: ReceiptLineItem[];
  total: number;
  paymentMethod?: string;
  warrantyEndLabel?: string;
}

// Angka gaya struk: tanpa "Rp", format ribuan id-ID (mis. 3.500.000)
const n = (v: number) => (v || 0).toLocaleString("id-ID");

export default function ThermalReceipt({
  storeName = "SOLIT 03",
  storeAddressLines = ["Jl. Raya Sawangan", "Sawangan, Depok"],
  storePhone,
  logoSrc = "/assets/solit03.jpeg",
  invoiceNumber,
  dateLabel,
  cashierName,
  customerName,
  items,
  total,
  paymentMethod,
  warrantyEndLabel,
}: ThermalReceiptProps) {
  const subtotal = sumLineItems(items);
  const savings = sumSavings(items);

  return (
    <div
      className="thermal-print-area font-mono text-black bg-white mx-auto"
      style={{
        width: "80mm",
        padding: "4mm 5mm",
        fontSize: "11px",
        lineHeight: 1.4,
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {/* ── KOP: logo di atas, teks center — gaya struk minimarket ── */}
      <div className="text-center leading-tight">
        {logoSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            alt={storeName}
            className="object-contain mx-auto"
            style={{ width: "18mm", height: "auto", marginBottom: "1.5mm" }}
          />
        )}
        <p className="font-bold tracking-[0.15em]" style={{ fontSize: "13px" }}>{storeName}</p>
        {storeAddressLines.map((line, i) => (
          <p key={i} className="text-[10px]">{line}</p>
        ))}
        {storePhone && <p className="text-[10px]">Telp: {storePhone}</p>}
      </div>

      <Dashed />

      {/* ── Meta transaksi ── */}
      <div className="space-y-0.5">
        <Row label="No. Nota" value={invoiceNumber} />
        <Row label="Tanggal" value={dateLabel} />
        {cashierName && <Row label="Kasir" value={cashierName} />}
        {customerName && <Row label="Pelanggan" value={customerName} />}
      </div>

      <Dashed />

      {/* ── Daftar item: nama di atas, kolom qty/harga/jumlah di bawah ── */}
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i}>
            <p className="uppercase break-words leading-snug">{it.label}</p>
            {it.meta && <p className="text-[10px] leading-tight">{it.meta}</p>}
            {it.officialUnitPrice && (
              <p className="text-[10px] leading-tight">
                Normal <span className="line-through">{n(it.officialUnitPrice)}</span>
                {it.hasDiscount ? ` (-${it.discountPercent}%)` : ""}
              </p>
            )}
            <div className="grid grid-cols-[2.2rem_1fr_1fr] gap-1">
              <span>{it.qty}</span>
              <span className="text-right">{n(it.unitPrice)}</span>
              <span className="text-right font-semibold">
                {it.isBonus ? "BONUS" : n(it.amount)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <Dashed />

      {/* ── Ringkasan (rata kanan gaya Indomaret) ── */}
      <div className="ml-auto space-y-0.5" style={{ width: "72%" }}>
        <SumRow label="Subtotal" value={n(subtotal)} />
        {savings > 0 && <SumRow label="Diskon" value={`(${n(savings)})`} />}
        <div style={{ borderTop: "1px dashed #000", margin: "3px 0" }} />
        <SumRow label="TOTAL" value={n(total)} bold />
        {paymentMethod && <SumRow label="BAYAR" value={paymentMethod} />}
      </div>

      {savings > 0 && (
        <p className="text-center mt-1.5 font-semibold">ANDA HEMAT : {n(savings)}</p>
      )}

      {warrantyEndLabel && (
        <>
          <Dashed />
          <Row label="Garansi s/d" value={warrantyEndLabel} />
        </>
      )}

      {/* ── Footer bergaris ganda + barcode ── */}
      <div className="mt-2 text-center leading-tight" style={{ fontSize: "10px" }}>
        <p>TERIMA KASIH. SELAMAT BELANJA KEMBALI</p>
        <p className="font-semibold">{storeName} — LAPTOP BERKUALITAS</p>
        <p>Cek Garansi: solit03.com/cek-garansi</p>
        <Barcode value={invoiceNumber} />
        <DoubleLine />
        <p>WWW.SOLIT03.COM</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className="text-right break-all">{value}</span>
    </div>
  );
}

function SumRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`} style={bold ? { fontSize: "13px" } : undefined}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function Dashed() {
  return <div className="my-2" style={{ borderTop: "1px dashed #000", height: 0 }} />;
}

function DoubleLine() {
  return <div className="my-1" style={{ borderTop: "3px double #000", height: 0 }} />;
}

// Barcode dekoratif untuk print — bar hitam-putih (printColorAdjust:exact biar ikut tercetak)
function Barcode({ value }: { value: string }) {
  return (
    <div className="mx-auto mt-1.5" style={{ width: "60%" }}>
      <div
        aria-hidden
        style={{
          height: "9mm",
          backgroundImage:
            "repeating-linear-gradient(90deg, #000 0 0.3mm, #fff 0.3mm 0.7mm, #000 0.7mm 1.1mm, #fff 1.1mm 1.4mm, #000 1.4mm 2mm, #fff 2mm 2.5mm)",
          WebkitPrintColorAdjust: "exact",
          printColorAdjust: "exact",
        }}
      />
      <p className="text-[9px] tracking-[0.25em] mt-0.5">{value}</p>
    </div>
  );
}