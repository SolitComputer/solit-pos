// worker/index.js
// Custom service worker untuk push notification (model WhatsApp).
// next-pwa otomatis meng-inject file ini ke sw.js yang di-generate saat build.

self.addEventListener("push", (event) => {
    if (!event.data) return;

    let payload;
    try {
        payload = event.data.json();
    } catch {
        payload = { title: "Solit POS", body: event.data.text() };
    }

    const title = payload.title || "Solit POS";
    const isSilent = payload.silent ?? false;

    const options = {
        body: payload.body || "",
        icon: payload.icon || "/assets/solit03.jpeg",
        badge: payload.badge || "/assets/solit03.jpeg",
        tag: payload.tag || "solit-chat",
        // renotify hanya kalau TIDAK silent — silent+renotify ditolak/warning di Chrome
        renotify: isSilent ? false : (payload.renotify ?? true),
        requireInteraction: payload.requireInteraction ?? false,
        silent: isSilent,
        vibrate: isSilent ? undefined : [200, 100, 200], // jangan getar kalau silent (mis. ucapan ultah)
        timestamp: Date.now(),
        data: payload.data || { url: "/dashboard/users" },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const data = event.notification.data || {};
    const targetUrl = data.url || "/dashboard/users";
    const absoluteUrl = new URL(targetUrl, self.location.origin).href;

    event.waitUntil(
        self.clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then((clientList) => {
                // Cari tab app yang SUDAH kebuka (origin sama) → fokusin & suruh buka chat
                for (const client of clientList) {
                    if (client.url.startsWith(self.location.origin)) {
                        return client.focus().then((focused) => {
                            (focused || client).postMessage({ type: "NOTIFICATION_CLICK", url: targetUrl });
                        });
                    }
                }
                // Belum ada tab → buka window baru ke URL absolut (bukan root hostinger)
                if (self.clients.openWindow) return self.clients.openWindow(absoluteUrl);
            })
    );
});