// src/lib/push-notify.ts
import webpush from "web-push";
import { supabaseAdmin } from "@/services/supabaseAdmin";

// ✅ Init VAPID dengan guard — tidak crash jika env belum diset
function initVapid() {
    const email = process.env.VAPID_EMAIL;
    const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privKey = process.env.VAPID_PRIVATE_KEY;

    if (!email || !pubKey || !privKey) {
        console.warn("[push-notify] VAPID env belum diset — push notification dinonaktifkan");
        return false;
    }

    try {
        webpush.setVapidDetails(email, pubKey, privKey);
        return true;
    } catch (err) {
        console.error("[push-notify] Gagal init VAPID:", err);
        return false;
    }
}

const vapidReady = initVapid();

export interface PushPayload {
    title: string;
    body: string;
    icon?: string;
    tag?: string;
    url?: string;
    requireInteraction?: boolean;
}

// ─── Helper internal ───────────────────────────────────────────────────────────
async function sendAndCleanup(
    subs: Array<{ user_id?: string; endpoint: string; p256dh: string; auth: string }>,
    notification: string
): Promise<void> {
    if (!vapidReady) return;

    const results = await Promise.allSettled(
        subs.map((sub) =>
            webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                notification
            )
        )
    );

    // Cleanup subscription expired (410 Gone / 404 Not Found)
    const expiredEndpoints: string[] = [];
    results.forEach((result, idx) => {
        if (result.status === "rejected") {
            const err = result.reason as any;
            const status = err?.statusCode ?? err?.status;
            if (status === 410 || status === 404) {
                expiredEndpoints.push(subs[idx].endpoint);
            } else {
                console.error("[push] Send error:", err?.message ?? err);
            }
        }
    });

    if (expiredEndpoints.length > 0) {
        await supabaseAdmin
            .from("push_subscriptions")
            .delete()
            .in("endpoint", expiredEndpoints);
        console.log(`[push] Cleaned up ${expiredEndpoints.length} expired subscriptions`);
    }
}

/**
 * Kirim push notification ke semua device dari satu user
 */
export async function sendPushToUser(
    userId: string,
    payload: PushPayload
): Promise<void> {
    if (!vapidReady) return;

    const { data: subs, error } = await supabaseAdmin
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", userId);

    if (error) { console.error("[push] DB error:", error.message); return; }
    if (!subs || subs.length === 0) return;

    const notification = JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon ?? "/favicon.ico",
        badge: "/favicon.ico",
        tag: payload.tag ?? `notif-${Date.now()}`,
        requireInteraction: payload.requireInteraction ?? false,
        data: { url: payload.url ?? "/dashboard/users" },
    });

    console.log(`[push] Sending DM to user ${userId}, ${subs.length} device(s)`);
    await sendAndCleanup(subs, notification);
}

/**
 * Kirim push notification ke semua user kecuali sender (group broadcast)
 */
export async function sendPushBroadcast(
  excludeUserId: string,
  payload: PushPayload
): Promise<void> {
  if (!vapidReady) return;

  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .neq("user_id", excludeUserId);

  if (error) { console.error("[push] DB error:", error.message); return; }
  if (!subs || subs.length === 0) {
    console.log("[push] Tidak ada subscriber untuk broadcast");
    return;
  }

  const notification = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? "/favicon.ico",
    badge: "/favicon.ico",
    // ✅ Tag unik per broadcast agar tidak saling replace
    tag: `${payload.tag ?? "notif"}-${Date.now()}`,
    requireInteraction: payload.requireInteraction ?? false,
    data: { url: payload.url ?? "/dashboard/users" },
  });

  console.log(`[push] Broadcasting ke ${subs.length} device(s)`);
  await sendAndCleanup(subs, notification);
}

// ✅ Sama untuk sendPushToUser — tag unik per DM
export async function sendPushToUsers(
  userId: string,
  payload: PushPayload
): Promise<void> {
  if (!vapidReady) return;

  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) { console.error("[push] DB error:", error.message); return; }
  if (!subs || subs.length === 0) return;

  const notification = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? "/favicon.ico",
    badge: "/favicon.ico",
    // ✅ DM: tag per sender agar masih bisa group per orang
    // tapi tetap unique dengan timestamp jika spam
    tag: payload.tag ? `${payload.tag}-${Date.now()}` : `notif-${Date.now()}`,
    requireInteraction: payload.requireInteraction ?? false,
    data: { url: payload.url ?? "/dashboard/users" },
  });

  console.log(`[push] Sending to user ${userId}, ${subs.length} device(s)`);
  await sendAndCleanup(subs, notification);
}