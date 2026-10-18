import crypto from "crypto";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const APP_ID = process.env.FACEBOOK_APP_ID!;
const APP_SECRET = process.env.FACEBOOK_APP_SECRET!;

export function getOAuthDialogUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: redirectUri,
    state,
    scope: "pages_show_list,pages_messaging,pages_manage_metadata",
    response_type: "code",
  });
  return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
}

export async function exchangeCodeForUserToken(code: string, redirectUri: string) {
  const params = new URLSearchParams({ client_id: APP_ID, client_secret: APP_SECRET, redirect_uri: redirectUri, code });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message ?? "Gagal tukar code jadi token");
  return data.access_token as string;
}

export async function exchangeForLongLivedUserToken(shortLivedToken: string) {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token", client_id: APP_ID, client_secret: APP_SECRET, fb_exchange_token: shortLivedToken,
  });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message ?? "Gagal perpanjang token");
  return data.access_token as string;
}

export interface ManagedPage { id: string; name: string; access_token: string }

interface ManagedPagesResponse {
  data: ManagedPage[];
  paging?: { next?: string };
  error?: { message: string };
}

/** Ambil semua Page yang dikelola user yang baru login OAuth (paginated, buat jaga-jaga kalau >100 Page). */
export async function getManagedPages(longLivedUserToken: string): Promise<ManagedPage[]> {
  const pages: ManagedPage[] = [];
  let url: string | null = `${GRAPH_BASE}/me/accounts?fields=id,name,access_token&limit=100&access_token=${longLivedUserToken}`;
  while (url) {
        const res: Response = await fetch(url);
    const data: ManagedPagesResponse = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message ?? "Gagal ambil daftar Page");
    pages.push(...(data.data ?? []));
    url = data.paging?.next ?? null;
  }
  return pages;
}

export async function subscribePageToWebhook(pageId: string, pageAccessToken: string) {
  const res = await fetch(
    `${GRAPH_BASE}/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${pageAccessToken}`,
    { method: "POST" }
  );
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message ?? "Gagal subscribe Page ke webhook");
  return data;
}

interface SendMessageParams { pageAccessToken: string; recipientId: string; message?: string; mediaUrl?: string }
interface SendMessageResult { status: boolean; messageId?: string; reason?: string }

export async function sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
  const { pageAccessToken, recipientId, message, mediaUrl } = params;
  const messagePayload = mediaUrl
    ? { attachment: { type: "image", payload: { url: mediaUrl, is_reusable: true } } }
    : message ? { text: message } : null;
  if (!messagePayload) return { status: false, reason: "Pesan atau media wajib diisi" };

  const res = await fetch(`${GRAPH_BASE}/me/messages?access_token=${pageAccessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, message: messagePayload, messaging_type: "RESPONSE" }),
  });
  const data = await res.json();
  if (!res.ok || data.error) return { status: false, reason: data.error?.message ?? `Gagal kirim (status ${res.status})` };
  return { status: true, messageId: data.message_id };
}

export async function getUserProfile(params: { pageAccessToken: string; psid: string }): Promise<{ name: string | null }> {
  const res = await fetch(`${GRAPH_BASE}/${params.psid}?fields=first_name,last_name&access_token=${params.pageAccessToken}`);
  if (!res.ok) return { name: null };
  const data = await res.json();
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ");
  return { name: name || null };
}

/** Verifikasi X-Hub-Signature-256 biar cuma Meta yang bisa nge-hit webhook kita. */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}