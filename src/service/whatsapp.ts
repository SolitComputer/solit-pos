/**
 * Kirim pesan WhatsApp via Fonnte API
 * Docs: https://fonnte.com/docs
 */
export async function sendWhatsapp(target: string, message: string): Promise<boolean> {
  try {
    // Normalisasi nomor: 08xx → 628xx
    const normalized = target.replace(/^0/, "62").replace(/\D/g, "");

    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: process.env.WHATSAPP_API_KEY || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target: normalized,
        message,
        countryCode: "62",
      }),
    });

    const result = await res.json();

    if (!res.ok || result.status === false) {
      console.error("[Fonnte] Gagal kirim WA:", result);
      return false;
    }

    console.log("[Fonnte] WA terkirim ke:", normalized);
    return true;
  } catch (error) {
    console.error("[Fonnte] Error:", error);
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