// public/sw.js
// Service Worker — handles push notifications

self.addEventListener("install", (event) => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(clients.claim());
});

// ─── Handle push event ────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
    if (!event.data) return;

    let payload;
    try {
        payload = event.data.json();
    } catch {
        payload = { title: "Solit POS", body: event.data.text() };
    }

    const {
        title = "Solit POS",
        body = "Ada pesan baru",
        icon = "/favicon.ico",
        badge = "/favicon.ico",
        tag,
        data = {},
        requireInteraction = false,
    } = payload;

    const options = {
        body,
        icon,
        badge,
        tag: tag || `msg-${Date.now()}`,
        data,
        requireInteraction,
        vibrate: [200, 100, 200],
        actions: [
            { action: "open", title: "Buka" },
            { action: "dismiss", title: "Tutup" },
        ],
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// ─── Handle notification click ────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    if (event.action === "dismiss") return;

    const url = event.notification.data?.url || "/dashboard/users";

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
            // Fokus ke tab yang sudah buka app jika ada
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && "focus" in client) {
                    client.focus();
                    client.postMessage({ type: "NOTIFICATION_CLICK", url });
                    return;
                }
            }
            // Buka tab baru jika belum ada
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});