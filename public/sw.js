// public/sw.js
self.addEventListener("install", (event) => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener("push", (event) => {
    if (!event.data) return;

    let payload;
    try {
        payload = event.data.json();
    } catch {
        payload = { title: "Solit POS", body: event.data.text() };
    }

    const title = payload.title || "Solit POS";
    const body = payload.body || "Ada pesan baru";
    const icon = payload.icon || "/assets/solit03.jpeg";  
    const badge = payload.badge || "/assets/solit03.jpeg";
    const tag = payload.tag || ("msg-" + Date.now());
    const data = payload.data || {};
    const requireInteraction = payload.requireInteraction || false;

    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            icon,
            badge,
            tag,
            data,
            requireInteraction,
            vibrate: [200, 100, 200],
            actions: [
                { action: "open", title: "Buka" },
                { action: "dismiss", title: "Tutup" },
            ],
        })
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    if (event.action === "dismiss") return;

    const url = (event.notification.data && event.notification.data.url)
        ? event.notification.data.url
        : "/dashboard";

    event.waitUntil((async () => {
        const clientList = await clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of clientList) {
            if (client.url.includes(self.location.origin) && "focus" in client) {
                await client.focus();                                  
                client.postMessage({ type: "NOTIFICATION_CLICK", url }); 
                return;
            }
        }
        if (clients.openWindow) await clients.openWindow(url);         
    })());
});