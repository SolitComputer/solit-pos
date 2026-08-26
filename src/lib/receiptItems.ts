// Tipe & helper bersama untuk menyusun baris item Nota/Invoice/pesan WhatsApp.
// Satu sumber logika supaya format qty/harga-satuan/subtotal konsisten di semua tempat.

export interface TxItemRow {
  item_type?: string | null;
  item_name?: string | null;
  serial_number?: string | null;
  quantity?: number | null;
  deal_price?: number | null;
  is_bonus?: boolean | null;
}

export interface ReceiptLineItem {
  label: string;
  meta?: string;
  qty: number;
  unitPrice: number;
  amount: number;
  isBonus: boolean;
}

/**
 * Ubah baris mentah `transaction_items` jadi ReceiptLineItem siap tampil.
 * Dipakai bareng oleh halaman Nota (/receipt), Invoice (/invoice), dan builder WA.
 */
export function buildLineItemsFromTxItems(txItems: TxItemRow[]): ReceiptLineItem[] {
  return (txItems ?? []).map((it) => {
    const isAccessory = it.item_type === "accessory";
    const qty = Number(it.quantity) || 1;
    const amount = Number(it.deal_price) || 0;
    const isBonus = Boolean(it.is_bonus || (isAccessory && amount === 0));
    const unitPrice = qty > 0 ? Math.round(amount / qty) : amount;
    const sn = it.serial_number && it.serial_number !== "-" ? it.serial_number : undefined;

    return {
      label: it.item_name || (isAccessory ? "Aksesori" : "Laptop"),
      meta: sn ? `SN: ${sn}` : undefined,
      qty,
      unitPrice,
      amount,
      isBonus,
    };
  });
}

/** Total nominal seluruh item (item bonus dihitung Rp0). */
export function sumLineItems(items: ReceiptLineItem[]): number {
  return items.reduce((s, it) => s + (it.isBonus ? 0 : it.amount), 0);
}

const fmtNum = (n: number) => (n || 0).toLocaleString("id-ID");

function padLine(left: string, right: string, width: number): string {
  const gap = width - left.length - right.length;
  return gap > 0 ? `${left}${" ".repeat(gap)}${right}` : `${left} ${right}`;
}

/**
 * Render daftar item jadi teks monospace rata kanan-kiri (tanpa kop/total).
 * Berguna kalau cuma butuh daftar barangnya saja, tanpa header toko.
 */
export function formatLineItemsForWhatsApp(items: ReceiptLineItem[], width = 32): string {
  if (!items || items.length === 0) return "";
  const lines: string[] = [];

  items.forEach((it, idx) => {
    if (idx > 0) lines.push("-".repeat(width));
    lines.push(it.label);
    if (it.meta) lines.push(it.meta);
    const rightVal = it.isBonus ? "BONUS" : `Rp${fmtNum(it.amount)}`;
    lines.push(padLine(`${it.qty} x Rp${fmtNum(it.unitPrice)}`, rightVal, width));
  });

  lines.push("-".repeat(width));
  lines.push(padLine("Subtotal", `Rp${fmtNum(sumLineItems(items))}`, width));

  return lines.join("\n");
}

export interface WhatsappReceiptParams {
  storeName: string;
  invoiceNumber: string;
  dateLabel: string;
  items: ReceiptLineItem[];
  total: number;
  paymentMethod?: string;
  statusLabel?: string;
  width?: number;
}

/**
 * Bangun satu blok struk monospace UTUH (kop toko, item, TOTAL/BAYAR/STATUS) —
 * dibungkus ``` di WhatsApp supaya jadi monospace dan nominal rata kanan,
 * persis seperti struk kasir (mis. Indomaret).
 */
export function buildWhatsappReceiptBlock(params: WhatsappReceiptParams): string {
  const width = params.width ?? 32;
  const lines: string[] = [];

  const center = (s: string) => {
    const clipped = s.length > width ? s.slice(0, width) : s;
    const pad = Math.max(0, Math.floor((width - clipped.length) / 2));
    return " ".repeat(pad) + clipped;
  };

  lines.push("=".repeat(width));
  lines.push(center(params.storeName.toUpperCase()));
  lines.push("=".repeat(width));
  lines.push(`Invoice : ${params.invoiceNumber}`);
  lines.push(`Tanggal : ${params.dateLabel}`);
  lines.push("-".repeat(width));

  params.items.forEach((it, idx) => {
    if (idx > 0) lines.push("-".repeat(width));
    lines.push(it.label);
    if (it.meta) lines.push(it.meta);
    const rightVal = it.isBonus ? "BONUS" : `Rp${fmtNum(it.amount)}`;
    lines.push(padLine(`${it.qty} x Rp${fmtNum(it.unitPrice)}`, rightVal, width));
  });

  lines.push("-".repeat(width));
  lines.push(padLine("TOTAL", `Rp${fmtNum(params.total)}`, width));
  if (params.paymentMethod) lines.push(padLine("BAYAR", params.paymentMethod, width));
  if (params.statusLabel) lines.push(padLine("STATUS", params.statusLabel, width));
  lines.push("=".repeat(width));

  return lines.join("\n");
}