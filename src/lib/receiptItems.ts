// Tipe & helper bersama untuk menyusun baris item Nota/Invoice/pesan WhatsApp.
// Satu sumber logika supaya format qty/harga-satuan/subtotal konsisten di semua tempat.


export interface TxItemRow {
  item_type?: string | null;
  item_name?: string | null;
  serial_number?: string | null;
  quantity?: number | null;
  deal_price?: number | null;
  is_bonus?: boolean | null;
  /** Total harga JUAL RESMI (official) untuk baris ini = qty × harga resmi per unit.
   *  Diisi manual oleh caller (bukan dari kolom transaction_items) — dipakai
   *  buat bandingin sama deal_price supaya bisa munculin coretan + diskon. */
  official_price?: number | null;
}
export interface ReceiptLineItem {
  label: string;
  meta?: string;
  qty: number;
  unitPrice: number;
  amount: number;
  isBonus: boolean;
  /** Harga resmi per unit — cuma keisi kalau perlu ditampilkan dicoret (ada diskon, atau item bonus). */
  officialUnitPrice?: number;
  /** Total harga resmi (qty × officialUnitPrice) — dipakai hitung nominal hemat. */
  officialAmount?: number;
  /** Persentase diskon dari harga resmi, cuma ada kalau item BERBAYAR & lebih murah dari harga resmi. */
  discountPercent?: number;
  /** true kalau item berbayar & harganya di bawah harga resmi (bukan bonus). */
  hasDiscount?: boolean;
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

    // ── Banding harga deal vs harga JUAL RESMI (official) ──
    // - Item BERBAYAR yang deal price-nya di bawah harga resmi → dicoret +
    //   badge "Diskon X%". Kalau deal >= harga resmi → tampil normal, tidak
    //   ada perubahan apa pun (sesuai request).
    // - Item BONUS yang punya harga resmi → tetap dicoret (tanpa badge %),
    //   biar keliatan nilai barang gratisnya, dan ikut dihitung ke "Hemat".
       const officialTotal = Number(it.official_price) || 0;
    const officialUnitPrice = officialTotal > 0 && qty > 0 ? Math.round(officialTotal / qty) : 0;
    // Math.floor (bukan round) + cap 99% — item ini masih BERBAYAR (unitPrice > 0,
    // bukan bonus), jadi angka diskon tidak boleh nyampe/kebulat ke 100% walau
    // selisihnya nyaris seharga penuh (mis. Rp10rb dari Rp12jt = 99.91% → dulu
    // dibulatkan jadi "100%" yang menyesatkan, seolah gratis padahal masih dibayar).
    const rawDiscountPercent = !isBonus && officialUnitPrice > unitPrice
      ? Math.min(99, Math.floor((1 - unitPrice / officialUnitPrice) * 100))
      : 0;
    const hasDiscount = rawDiscountPercent >= 1; // hindari "Diskon 0%" akibat pembulatan
    const showOfficialPrice = hasDiscount || (isBonus && officialUnitPrice > 0);
    return {
      label: it.item_name || (isAccessory ? "Aksesori" : "Laptop"),
      meta: sn ? `SN: ${sn}` : undefined,
      qty,
      unitPrice,
      amount,
      isBonus,
      officialUnitPrice: showOfficialPrice ? officialUnitPrice : undefined,
      officialAmount: showOfficialPrice ? officialTotal : undefined,
      discountPercent: hasDiscount ? rawDiscountPercent : undefined,
      hasDiscount,
    };
  });
}

/** Total nominal seluruh item (item bonus dihitung Rp0). */
export function sumLineItems(items: ReceiptLineItem[]): number {
  return items.reduce((s, it) => s + (it.isBonus ? 0 : it.amount), 0);
}

/** Total nominal yang dihemat customer — dari item diskon (selisih harga)
 *  maupun item bonus (nilai penuh barang gratis). Rp0 kalau tidak ada. */
export function sumSavings(items: ReceiptLineItem[]): number {
  return items.reduce((s, it) => {
    if (!it.officialAmount) return s;
    return s + Math.max(0, it.officialAmount - it.amount);
  }, 0);
}

// Data minimal dari tabel `transactions` yang dibutuhkan untuk fallback di bawah.
export interface TxFallbackData {
  laptop_name?: string | null;
  serial_number?: string | null;
  serial_numbers?: string[] | null;
  deal_price?: number | null;
  amount?: number | null;
}

/**
 * Fallback kalau `transaction_items` KOSONG (mis. transaksi RESERVED/HELD
 * yang belum pernah direkonsiliasi lewat PUT /api/transaction/[invoice]).
 * Bikin baris item langsung dari kolom `transactions`, supaya Nota/Invoice
 * tidak menampilkan "Belum ada rincian barang" padahal transaksinya valid.
 */
export function buildFallbackLineItems(tx: TxFallbackData): ReceiptLineItem[] {
  const amount = Number(tx.deal_price ?? tx.amount ?? 0);
  const serials = Array.isArray(tx.serial_numbers) && tx.serial_numbers.length > 0
    ? tx.serial_numbers.filter(Boolean)
    : tx.serial_number
      ? [tx.serial_number]
      : [];
  const label = tx.laptop_name || "Laptop";

  if (serials.length > 1) {
    const unitPrice = Math.round(amount / serials.length);
    return serials.map((sn) => ({
      label,
      meta: `SN: ${sn}`,
      qty: 1,
      unitPrice,
      amount: unitPrice,
      isBonus: false,
    }));
  }

  return [
    {
      label,
      meta: serials[0] ? `SN: ${serials[0]}` : undefined,
      qty: 1,
      unitPrice: amount,
      amount,
      isBonus: false,
    },
  ];
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
    if (it.officialUnitPrice) {
      lines.push(
        `Harga Normal: ~Rp${fmtNum(it.officialUnitPrice)}~${it.hasDiscount ? ` (Diskon ${it.discountPercent}%)` : ""}`
      );
    }
    const rightVal = it.isBonus ? "BONUS" : `Rp${fmtNum(it.amount)}`;
    lines.push(padLine(`${it.qty} x Rp${fmtNum(it.unitPrice)}`, rightVal, width));
  });

  lines.push("-".repeat(width));
  lines.push(padLine("Subtotal", `Rp${fmtNum(sumLineItems(items))}`, width));
  const savings = sumSavings(items);
  if (savings > 0) {
    lines.push(padLine("Hemat", `Rp${fmtNum(savings)}`, width));
  }

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
    if (it.officialUnitPrice) {
      lines.push(padLine("Harga Normal", `~Rp${fmtNum(it.officialUnitPrice)}~`, width));
      if (it.hasDiscount) lines.push(`Diskon ${it.discountPercent}%`);
    }
    const rightVal = it.isBonus ? "BONUS" : `Rp${fmtNum(it.amount)}`;
    lines.push(padLine(`${it.qty} x Rp${fmtNum(it.unitPrice)}`, rightVal, width));
  });

  lines.push("-".repeat(width));
  lines.push(padLine("Subtotal", `Rp${fmtNum(sumLineItems(params.items))}`, width));
  const savings = sumSavings(params.items);
  if (savings > 0) {
    lines.push(padLine("Hemat", `Rp${fmtNum(savings)}`, width));
  }
  lines.push("-".repeat(width));
  lines.push(padLine("TOTAL", `Rp${fmtNum(params.total)}`, width));
  if (params.paymentMethod) lines.push(padLine("BAYAR", params.paymentMethod, width));
  if (params.statusLabel) lines.push(padLine("STATUS", params.statusLabel, width));
  lines.push("=".repeat(width));

  return lines.join("\n");
} 