import { buildWhatsappReceiptBlock, type ReceiptLineItem } from "@/lib/receiptItems";

export async function sendWhatsapp(
  target: string,
  message: string
): Promise<boolean> {
  const MAX_RETRIES = 3;
  let lastError: unknown;

  if (!target || !message) {
    console.warn("[Fonnte] Target atau message kosong");
    return false;
  }

  // Normalisasi nomor
  let normalized = target.replace(/\D/g, "");
  if (normalized.startsWith("0")) {
    normalized = "62" + normalized.slice(1);
  } else if (!normalized.startsWith("62")) {
    normalized = "62" + normalized;
  }

  // ── TAMBAHAN: validasi panjang nomor Indonesia ──
  // Format: 62 + 8-13 digit = total 10-15 karakter
  if (normalized.length < 10 || normalized.length > 15) {
    console.warn("[Fonnte] Nomor tidak valid (panjang):", normalized);
    return false;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Fonnte] Attempt ${attempt}/${MAX_RETRIES} → ${normalized} | Invoice hint: ${message.slice(0, 40)}`);

      const controller = new AbortController();
      // ── Turunkan timeout per attempt dari 12s → 8s ──
      // Supaya 3 retry masih muat dalam window 15s dari race di create/route.ts
      const timeoutId = setTimeout(() => controller.abort(), 8_000);

      const res = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: {
          Authorization: process.env.WHATSAPP_API_KEY ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target: normalized,
          message,
          delay: "2",
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const result = await res.json().catch(() => ({}));
      console.log(`[Fonnte] HTTP ${res.status} | Body:`, JSON.stringify(result));

      if (!res.ok || result.status === false) {
        console.error(`[Fonnte] Gagal attempt ${attempt}:`, result);
        lastError = result;

        if (res.status === 401 || res.status === 403) {
          console.error("[Fonnte] Token invalid — hentikan retry");
          break;
        }

        // ── TAMBAHAN: device disconnect = tidak perlu retry ──
        if (result.reason?.toLowerCase?.().includes("disconnect") ||
          result.reason?.toLowerCase?.().includes("not found")) {
          console.error("[Fonnte] Device tidak terhubung — hentikan retry");
          break;
        }

        continue;
      }

      console.log(`[Fonnte] ✅ Terkirim ke ${normalized}`);
      return true;

    } catch (err: unknown) {
      lastError = err;
      const errName = err instanceof Error ? err.name : "Unknown";
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Fonnte] Error attempt ${attempt}: ${errName} — ${errMsg}`);

      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1_000 * attempt));
      }
    }
  }

  console.error("[Fonnte] ❌ Gagal setelah semua retry. Last error:", JSON.stringify(lastError));
  return false;
}


export function buildPaymentMessage(data: {
  customer_name: string;
  invoice_number: string;
  laptop_name: string;
  serial_number?: string;
  amount: number;
  payment_method: string;
  pickup_method: string;
  pickup_date?: string;
  pickup_time?: string;
  pickup_location?: string;
  software_request?: string;
  customer_type?: string;
  items?: ReceiptLineItem[];
}): string {
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("id-ID", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

  const pickupInfo =
    data.pickup_method === "DIANTAR"
      ? `📍 Alamat      : ${data.pickup_location || "-"}`
      : `🏪 Metode      : Datang ke toko`;

  const scheduleLines = data.pickup_date
    ? [
      `📅 Tanggal    : ${fmtDate(data.pickup_date)}`,
      data.pickup_time ? `⏰ Jam         : ${data.pickup_time}` : null,
    ]
      .filter(Boolean)
      .join("\n")
    : "";

  const items: ReceiptLineItem[] =
    data.items && data.items.length > 0
      ? data.items
      : [
        {
          label: data.laptop_name,
          meta: data.serial_number ? `SN: ${data.serial_number}` : undefined,
          qty: 1,
          unitPrice: data.amount,
          amount: data.amount,
          isBonus: false,
        },
      ];

  const receiptBlock = buildWhatsappReceiptBlock({
    storeName: "SOLIT 03",
    invoiceNumber: data.invoice_number,
    dateLabel: new Date().toLocaleString("id-ID", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }),
    items,
    total: data.amount,
    paymentMethod: data.payment_method,
    statusLabel: "LUNAS",
  });

  return [
    `Halo *${data.customer_name}* 👋`,
    ``,
    `✅ Pembayaran laptop Anda telah *berhasil dikonfirmasi!*`,
    ``,
    "```",
    receiptBlock,
    "```",
    ``,
    data.customer_type === "RESELLER" ? `🔄 Tipe pelanggan : Reseller` : null,
    data.customer_type === "MITRA" ? `🤝 Tipe pelanggan : Mitra Bisnis` : null,
    data.software_request ? `💿 Software request : ${data.software_request}` : null,
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    `📦 *Info Pengambilan*`,
    `━━━━━━━━━━━━━━━━━━`,
    pickupInfo,
    scheduleLines || null,
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    `🛡️ *Garansi Laptop*`,
    `━━━━━━━━━━━━━━━━━━`,
    `Cek garansi online di:`,
    `🔗 https://solit03.com/cek-garansi`,
    data.serial_number ? `Masukkan SN: *${data.serial_number}*` : null,
    ``,
    `📋 *Ketentuan Garansi*`,
    `1. Garansi hanya berlaku untuk kerusakan yang BUKAN akibat human error.`,
    `2. Kerusakan LCD seperti pecah, kena air, terbakar, bergaris, berkedip, gelap/redup, blank putih, dead pixel, berbayang/shadow, warna pudar/tidak akurat, serta bercak hitam/putih TIDAK termasuk garansi.`,
    `3. Wajib membawa nota pembelian ini saat melakukan klaim garansi.`,
    `⚠️ *Note:* Barang yang sudah dibeli tidak bisa dikembalikan.`,
    ``,
    `Terima kasih sudah berbelanja di *Solit 03* 🙏`,
    `_Sawangan, Depok_`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}