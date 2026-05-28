/**
 * Kirim pesan WhatsApp via Fonnte API
 */
export async function sendWhatsapp(target: string, message: string): Promise<boolean> {
  const maxRetries = 3;
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!target || !message) {
        console.warn("[Fonnte] Target atau message kosong");
        return false;
      }

      let normalized = target.replace(/\D/g, "");
      if (normalized.startsWith("0")) normalized = "62" + normalized.slice(1);
      else if (!normalized.startsWith("62")) normalized = "62" + normalized;

      console.log(`[Fonnte] Attempt ${attempt}/${maxRetries} → ${normalized}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000); // 12 detik

      const res = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: {
          Authorization: process.env.WHATSAPP_API_KEY || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ target: normalized, message }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const result = await res.json().catch(() => ({}));

      console.log(`[Fonnte] Status: ${res.status} | Response:`, result);

      if (!res.ok || result.status === false) {
        console.error(`[Fonnte] Gagal (Attempt ${attempt})`, result);
        lastError = result;
        continue; // coba lagi
      }

      console.log(`[Fonnte] ✅ BERHASIL terkirim ke ${normalized}`);
      return true;

    } catch (error: any) {
      lastError = error;
      console.error(`[Fonnte] Error Attempt ${attempt}:`, error.name, "-", error.message);
      
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * attempt)); // backoff
      }
    }
  }

  console.error("[Fonnte] ❌ GAGAL setelah semua retry", lastError);
  return false;
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