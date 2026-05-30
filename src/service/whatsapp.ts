/**
 * Kirim pesan WhatsApp via Fonnte API
 * Pengirim: nomor CS Solit (089680400022) yang terdaftar di Fonnte
 */
export async function sendWhatsapp(
  target: string,
  message: string
): Promise<boolean> {
  const MAX_RETRIES = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (!target || !message) {
        console.warn("[Fonnte] Target atau message kosong");
        return false;
      }

      // Normalisasi nomor → format internasional 62xxx
      let normalized = target.replace(/\D/g, "");
      if (normalized.startsWith("0")) {
        normalized = "62" + normalized.slice(1);
      } else if (!normalized.startsWith("62")) {
        normalized = "62" + normalized;
      }

      console.log(`[Fonnte] Attempt ${attempt}/${MAX_RETRIES} → ${normalized}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12_000);

      const res = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: {
          // Token device 089680400022 dari .env.local
          Authorization: process.env.WHATSAPP_API_KEY ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target:  normalized,
          message: message,
          // Opsional: delay antar pesan jika bulk (dalam detik)
          delay: "2",
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const result = await res.json().catch(() => ({}));
      console.log(`[Fonnte] HTTP ${res.status} | Response:`, result);

      if (!res.ok || result.status === false) {
        console.error(`[Fonnte] Gagal attempt ${attempt}:`, result);
        lastError = result;

        // Jika token invalid, jangan retry
        if (res.status === 401 || res.status === 403) {
          console.error("[Fonnte] Token tidak valid, hentikan retry");
          break;
        }
        continue;
      }

      console.log(`[Fonnte] ✅ Terkirim ke ${normalized}`);
      return true;

    } catch (err: unknown) {
      lastError = err;
      const errName  = err instanceof Error ? err.name    : "Unknown";
      const errMsg   = err instanceof Error ? err.message : String(err);
      console.error(`[Fonnte] Error attempt ${attempt}: ${errName} — ${errMsg}`);

      if (attempt < MAX_RETRIES) {
        // Exponential backoff: 1s, 2s, 3s
        await new Promise((r) => setTimeout(r, 1_000 * attempt));
      }
    }
  }

  console.error("[Fonnte] ❌ Gagal setelah semua retry:", lastError);
  return false;
}

/**
 * Template pesan konfirmasi pembayaran
 * Dikirim otomatis setelah transaksi PAID
 */
export function buildPaymentMessage(data: {
  customer_name:    string;
  invoice_number:   string;
  laptop_name:      string;
  serial_number?:   string;
  amount:           number;
  payment_method:   string;
  pickup_method:    string;
  pickup_date?:     string;
  pickup_time?:     string;
  pickup_location?: string;
  software_request?: string;
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

  return [
    `Halo *${data.customer_name}* 👋`,
    ``,
    `✅ Pembayaran laptop Anda telah *berhasil dikonfirmasi!*`,
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    `📋 *Detail Transaksi*`,
    `━━━━━━━━━━━━━━━━━━`,
    `📄 Nota           : ${data.invoice_number}`,
    `💻 Laptop        : ${data.laptop_name}`,
    data.serial_number   ? `🔢 Serial No    : ${data.serial_number}` : null,
    data.software_request ? `💿 Software    : ${data.software_request}` : null,
    `💰 Total           : Rp${data.amount.toLocaleString("id-ID")}`,
    `💳 Pembayaran  : ${data.payment_method}`,
    `🏷️ Status         : LUNAS ✓`,
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
    `Terima kasih sudah berbelanja di *Solit 03* 🙏`,
    `_Sawangan, Depok_`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}