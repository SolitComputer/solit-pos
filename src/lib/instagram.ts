const GRAPH = "https://graph.facebook.com";
const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v21.0";

/** Kirim DM teks / gambar ke user Instagram lewat Page yang tertaut. */
export async function sendInstagramMessage(params: {
  pageAccessToken: string;
  recipientIgsid: string;
  text?: string | null;
  imageUrl?: string | null;
}): Promise<{ messageId: string | null }> {
  const message = params.imageUrl
    ? { attachment: { type: "image", payload: { url: params.imageUrl, is_reusable: true } } }
    : { text: params.text ?? "" };

  const res = await fetch(
    `${GRAPH}/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(params.pageAccessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_type: "RESPONSE",
        recipient: { id: params.recipientIgsid },
        message,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Instagram send gagal (status ${res.status})`);
  }
  return { messageId: data?.message_id ?? null };
}

/** Ambil nama/username profil customer dari IGSID.
 *  Butuh consent: hanya jalan kalau customer sudah pernah DM duluan. */
export async function getInstagramUserProfile(params: {
  igsid: string;
  pageAccessToken: string;
}): Promise<{ name: string | null; username: string | null }> {
  try {
    const res = await fetch(
      `${GRAPH}/${GRAPH_VERSION}/${params.igsid}?fields=name,username&access_token=${encodeURIComponent(params.pageAccessToken)}`
    );
    const data = await res.json();
    if (!res.ok) return { name: null, username: null };
    return { name: data?.name ?? null, username: data?.username ?? null };
  } catch {
    return { name: null, username: null };
  }
}