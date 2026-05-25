/**
 * Kirim pesan WhatsApp via Fonnte API
 */
export async function sendWhatsapp(target: string, message: string): Promise<boolean> {
  try {
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

    console.log(`[Fonnte] Mengirim ke: ${normalized}`);

    // Fetch dengan timeout dan retry
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 detik timeout

    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: process.env.WHATSAPP_API_KEY || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target: normalized, message }),
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);

    const result = await res.json().catch(() => ({}));

    if (!res.ok || result.status === false) {
      console.error("[Fonnte] Gagal:", {
        status: res.status,
        result,
        target: normalized,
      });
      return false;
    }

    console.log(`[Fonnte] ✅ Berhasil terkirim ke ${normalized}`);
    return true;
  } catch (error: any) {
    console.error("[Fonnte] EXCEPTION:", error.name, "-", error.message);
    
    if (error.name === 'AbortError') {
      console.error("[Fonnte] Timeout - koneksi terlalu lama");
    }
    
    return false;
  }
}

/**
 * Template pesan konfirmasi pembayaran
 */
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
}): string {
  const pickupInfo =
    data.pickup_method === "DIANTAR"
      ? `📍 Alamat: ${data.pickup_location || "-"}`
      : `🏪 Datang ke toko`;

  const scheduleInfo =
    data.pickup_date
      ? `📅 Tanggal: ${new Date(data.pickup_date).toLocaleDateString("id-ID", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}${data.pickup_time ? `\n⏰ Jam: ${data.pickup_time}` : ""}`
      : "";

  return (
    `Halo *${data.customer_name}* 👋\n\n` +
    `✅ Pembayaran laptop Anda telah *berhasil dikonfirmasi!*\n\n` +
    `━━━━━━━━━━━━━━━\n` +
    `📋 *INVOICE: ${data.invoice_number}*\n` +
    `━━━━━━━━━━━━━━━\n\n` +
    `💻 *Laptop:* ${data.laptop_name}\n` +
    (data.serial_number ? `🔢 *SN:* ${data.serial_number}\n` : "") +
    (data.software_request ? `💿 *Software:* ${data.software_request}\n` : "") +
    `\n💰 *Total:* Rp${data.amount.toLocaleString("id-ID")}\n` +
    `💳 *Metode:* ${data.payment_method}\n` +
    `🏷️ *Status:* LUNAS\n\n` +
    `━━━━━━━━━━━━━━━\n` +
    `📦 *Info Pengambilan*\n` +
    `${pickupInfo}\n` +
    (scheduleInfo ? `${scheduleInfo}\n` : "") +
    `━━━━━━━━━━━━━━━\n\n` +
    `Terima kasih sudah berbelanja di *Solit 03* 🙏\n` +
    `_Sawangan, Depok_`
  );
}