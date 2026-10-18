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
    badge?: string;
    tag?: string;
    url?: string;
    requireInteraction?: boolean;
    silent?: boolean;
    renotify?: boolean; // ✅ BARU: kalau notif diganti (tag sama), tetap bunyi sekali
}

const DEFAULT_ICON = "/assets/solit03.jpeg";

// ✅ Satu sumber kebenaran untuk bentuk notifikasi (dulu di-copy 4x)
function buildNotification(payload: PushPayload): string {
    return JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon ?? DEFAULT_ICON,
        badge: payload.badge ?? DEFAULT_ICON,
        // ✅ KUNCI "notif sekali aja": tag STABIL (tanpa timestamp).
        // Notif dari percakapan yang sama akan saling menggantikan, bukan menumpuk.
        // Caller yang menentukan tag-nya (mis. "group-chat-<id>" / "dm-<senderId>").
        tag: payload.tag ?? "solit-chat",
        // ✅ renotify: walau notif lama diganti, user tetap dialert 1x untuk pesan baru
        // → tidak numpuk, tapi juga tidak ada yang kelewat.
        renotify: payload.renotify ?? true,
        requireInteraction: payload.requireInteraction ?? false,
        silent: payload.silent ?? false,
        data: { url: payload.url ?? "/dashboard/users" },
    });
}

// ─── Helper internal: kirim + bersihkan subscription mati ───────────────────────
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

/** Kirim push ke semua device dari SATU user (dipakai untuk DM). */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!vapidReady) return;

    const { data: subs, error } = await supabaseAdmin
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", userId);

    if (error) { console.error("[push] DB error:", error.message); return; }
    if (!subs || subs.length === 0) return;

    console.log(`[push] Sending DM to user ${userId}, ${subs.length} device(s)`);
    await sendAndCleanup(subs, buildNotification(payload));
}

/** Kirim push ke SEMUA user kecuali sender (broadcast grup default "All Team"). */
export async function sendPushBroadcast(excludeUserId: string, payload: PushPayload): Promise<void> {
    if (!vapidReady) return;

    const { data: subs, error } = await supabaseAdmin
        .from("push_subscriptions")
        .select("user_id, endpoint, p256dh, auth")
        .neq("user_id", excludeUserId);

    if (error) { console.error("[push] DB error:", error.message); return; }
    if (!subs || subs.length === 0) { console.log("[push] Tidak ada subscriber untuk broadcast"); return; }

    console.log(`[push] Broadcasting ke ${subs.length} device(s)`);
    await sendAndCleanup(subs, buildNotification(payload));
}

/**
 * Kirim push ke sekumpulan user tertentu (kecuali sender).
 * Dipakai chat grup NON-default: hanya anggota grup yang menerima notif.
 */
export async function sendPushToUserIds(
    userIds: string[],
    excludeUserId: string,
    payload: PushPayload
): Promise<void> {
    if (!vapidReady) return;

    const targetIds = userIds.filter((id) => id && id !== excludeUserId);
    if (targetIds.length === 0) return;

    const { data: subs, error } = await supabaseAdmin
        .from("push_subscriptions")
        .select("user_id, endpoint, p256dh, auth")
        .in("user_id", targetIds);

    if (error) { console.error("[push] DB error:", error.message); return; }
    if (!subs || subs.length === 0) return;

    console.log(`[push] Sending to ${subs.length} device(s) of ${targetIds.length} member(s)`);
    await sendAndCleanup(subs, buildNotification(payload));
}

// ✅ Alias untuk kompatibilitas import lama. Perilakunya kini sama persis dengan
// sendPushToUser (dulu fungsi kembar dengan icon berbeda — sudah disatukan).
export const sendPushToUsers = sendPushToUser;