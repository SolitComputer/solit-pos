// Wrapper tipis untuk Fonnte Device API + Send API.
// Referensi: https://docs.fonnte.com/category/device-api/
//
// ACCOUNT TOKEN (env FONNTE_ACCOUNT_TOKEN) → cuma dipakai addDevice()
// DEVICE TOKEN (disimpan per baris di whatsapp_accounts.fonnte_device_token)
//   → dipakai updateDeviceWebhook(), getDeviceQr(), deleteDevice(), sendMessage()
// Dua token ini TIDAK bisa dipertukarkan.

const FONNTE_BASE_URL = "https://api.fonnte.com";

interface AddDeviceResponse {
  status: boolean;
  reason?: string;
  token?: string;
  device?: string;
  name?: string;
}

function assertOk<T extends { status: boolean; reason?: string }>(data: T): T {
  if (!data.status) throw new Error(`Fonnte API error: ${data.reason ?? "unknown error"}`);
  return data;
}

export async function addDevice(params: {
  name: string;
  phoneNumber: string; 
}): Promise<AddDeviceResponse> {
  const accountToken = process.env.FONNTE_ACCOUNT_TOKEN;
  if (!accountToken) throw new Error("FONNTE_ACCOUNT_TOKEN belum diset di .env");

  const res = await fetch(`${FONNTE_BASE_URL}/add-device`, {
    method: "POST",
    headers: { Authorization: accountToken, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      name: params.name,
      device: params.phoneNumber,
      autoread: "true", 
      personal: "true",
      group: "false",  
    }),
  });
  return assertOk((await res.json()) as AddDeviceResponse);
}

export async function updateDeviceWebhook(params: {
  deviceToken: string;
  deviceName: string;
  phoneNumber: string;
  webhookUrl: string;
}) {
  const res = await fetch(`${FONNTE_BASE_URL}/update-device`, {
    method: "POST",
    headers: { Authorization: params.deviceToken, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      name: params.deviceName,
      device: params.phoneNumber,
      webhook: params.webhookUrl,
      autoread: "true",
      personal: "true",
      group: "false",
      // 🆕 ⚠️ Nama field ini BELUM terverifikasi 100% dari dokumentasi Fonnte —
      // tujuannya biar webhook status pesan (buat centang biru) ikut aktif.
      // Kalau setelah ini centang birunya tetap gak pernah muncul, kemungkinan
      // field-nya harus diaktifkan manual di dashboard Fonnte → Device → Edit.
      webhookstatus: "true",
    }),
  });
  return assertOk(await res.json());
}

export async function getDeviceQr(params: { deviceToken: string; phoneNumber: string }): Promise<{
  status: boolean; url?: string; reason?: string; code?: string;
}> {
  const res = await fetch(`${FONNTE_BASE_URL}/qr`, {
    method: "POST",
    headers: { Authorization: params.deviceToken, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ type: "qr", whatsapp: params.phoneNumber }),
  });
  return await res.json();
}


export async function deleteDevice(params: { deviceToken: string; otp?: string }) {
  const res = await fetch(`${FONNTE_BASE_URL}/delete-device`, {
    method: "POST",
    headers: { Authorization: params.deviceToken, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params.otp ? { otp: params.otp } : {}),
  });
  return await res.json();
}

/** Kirim pesan WA keluar (balasan CS). Pakai DEVICE TOKEN nomor pengirim. */
export async function sendMessage(params: {
  deviceToken: string;
  target: string; // format 628xxxxxxxxxx
  message?: string;
  mediaUrl?: string;
  filename?: string;
}): Promise<{ status: boolean; reason?: string; id?: string[] }> {
  const res = await fetch(`${FONNTE_BASE_URL}/send`, {
    method: "POST",
    headers: { Authorization: params.deviceToken, "Content-Type": "application/json" },
    body: JSON.stringify({
      target: params.target,
      message: params.message,
      url: params.mediaUrl,
      filename: params.filename,
      countryCode: "62",
    }),
  });
  return await res.json();
}

export interface FonnteDeviceInfo {
  device: string;
  name: string;
  status: "connect" | "disconnect" | string;
  token: string;
  autoread?: string;
  package?: string;
}

/** Ambil semua device yang SUDAH ada di akun Fonnte. Pakai ACCOUNT TOKEN. */
export async function getAllDevices(): Promise<{
  status: boolean; connected?: number; devices?: number; data?: FonnteDeviceInfo[]; reason?: string;
}> {
  const accountToken = process.env.FONNTE_ACCOUNT_TOKEN;
  if (!accountToken) throw new Error("FONNTE_ACCOUNT_TOKEN belum diset di .env");

  const res = await fetch(`${FONNTE_BASE_URL}/get-devices`, {
    method: "POST",
    headers: { Authorization: accountToken },
  });
  return await res.json();
}


export async function deleteMessage(params: { deviceToken: string; messageId: string }) {
  const res = await fetch(`${FONNTE_BASE_URL}/delete-message`, {
    method: "POST",
    headers: { Authorization: params.deviceToken, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id: params.messageId }),
  });
  return (await res.json()) as { status: boolean; detail?: string; reason?: string };
}