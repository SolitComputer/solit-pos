// worker/index.js
// Custom service worker untuk push notification.
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
    const options = {
        body: payload.body || "",
        icon: payload.icon || "/assets/solit03.jpeg",
        badge: payload.badge || "/assets/solit03.jpeg",
        tag: payload.tag || "solit-chat",
        renotify: payload.renotify ?? true,       // bunyi lagi walau notif diganti
        requireInteraction: payload.requireInteraction ?? false,
        silent: payload.silent ?? false,          // false = pakai suara default
        vibrate: [200, 100, 200],                 // getar HP
        data: payload.data || { url: "/dashboard/users" },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || "/dashboard/users";

    event.waitUntil(
        self.clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then((clientList) => {
                // Kalau app sudah kebuka → fokuskan tab + suruh buka DM
                // (useIncomingChat.ts sudah dengerin pesan "NOTIFICATION_CLICK")
                for (const client of clientList) {
                    if ("focus" in client) {
                        client.focus();
                        client.postMessage({ type: "NOTIFICATION_CLICK", url: targetUrl });
                        return;
                    }
                }
                // Belum ada tab → buka window baru ke URL yang benar (bukan root hostinger)
                if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
            })
    );
});