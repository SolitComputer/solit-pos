// src/hooks/usePushNotification.ts
"use client";

import { useEffect, useState, useCallback } from "react";

type PermissionState = "default" | "granted" | "denied" | "unsupported";

export function usePushNotification() {
    const [permission, setPermission] = useState<PermissionState>("default");
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Cek status awal + auto-register SW saat komponen mount
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!("Notification" in window) || !("serviceWorker" in navigator)) {
            setPermission("unsupported");
            return;
        }
        setPermission(Notification.permission as PermissionState);

        // ✅ Auto-register SW saat pertama load (tidak perlu tunggu user subscribe)
        // Ini penting agar SW sudah siap saat user klik "Aktifkan"
        navigator.serviceWorker.register("/sw.js").then(() => {
            checkSubscription();
        }).catch((err) => {
            console.error("[push] SW register error:", err);
            checkSubscription();
        });
    }, []);

    const checkSubscription = async () => {
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            setIsSubscribed(!!sub);
        } catch {
            setIsSubscribed(false);
        }
    };

    const subscribe = useCallback(async (): Promise<boolean> => {
        if (typeof window === "undefined") return false;
        if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;

        setIsLoading(true);
        try {
            // 1. Minta permission dari user
            const perm = await Notification.requestPermission();
            setPermission(perm as PermissionState);
            if (perm !== "granted") {
                console.warn("[push] Permission ditolak:", perm);
                return false;
            }

            // 2. Pastikan SW sudah terdaftar dan aktif
            // Daftarkan dulu jika belum
            await navigator.serviceWorker.register("/sw.js");
            // Tunggu sampai SW benar-benar ready/active
            const reg = await navigator.serviceWorker.ready;
            console.log("[push] SW ready, state:", reg.active?.state);

            // 3. Cek VAPID key
            const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
            if (!vapidKey) {
                console.error("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY belum diset di .env.local");
                return false;
            }
            console.log("[push] VAPID key tersedia:", vapidKey.slice(0, 20) + "...");

            // 4. Cek apakah sudah ada subscription aktif
            const existingSub = await reg.pushManager.getSubscription();
            if (existingSub) {
                // Sudah subscribe, kirim ulang ke server (mungkin belum tersimpan)
                console.log("[push] Subscription sudah ada, kirim ulang ke server");
                const res = await fetch("/api/push/subscribe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(existingSub.toJSON()),
                });
                const data = await res.json();
                console.log("[push] Re-register response:", data);
                if (res.ok) {
                    setIsSubscribed(true);
                    return true;
                }
            }

            // 5. Buat subscription baru
            console.log("[push] Membuat subscription baru...");
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey),
            });
            console.log("[push] Subscription berhasil dibuat:", subscription.endpoint.slice(0, 60) + "...");

            // 6. Kirim subscription ke server
            const res = await fetch("/api/push/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(subscription.toJSON()),
            });

            const data = await res.json();
            console.log("[push] Server response:", data);

            if (res.ok && data.success) {
                setIsSubscribed(true);
                return true;
            }

            console.error("[push] Server gagal simpan subscription:", data.message);
            return false;
        } catch (err) {
            console.error("[push] subscribe error:", err);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const unsubscribe = useCallback(async (): Promise<void> => {
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                const endpoint = sub.endpoint;
                await sub.unsubscribe();
                await fetch("/api/push/subscribe", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ endpoint }),
                });
                console.log("[push] Unsubscribed berhasil");
            }
            setIsSubscribed(false);
        } catch (err) {
            console.error("[push] unsubscribe error:", err);
        }
    }, []);

    return { permission, isSubscribed, isLoading, subscribe, unsubscribe };
}

// ─── Helper: convert VAPID public key ─────────────────────────────────────────
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray.buffer as ArrayBuffer;
}