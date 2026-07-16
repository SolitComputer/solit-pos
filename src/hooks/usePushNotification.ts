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

        //  Auto-register SW saat pertama load (tidak perlu tunggu user subscribe)
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
            const perm = await Notification.requestPermission();
            setPermission(perm as PermissionState);
            if (perm !== "granted") return false;

            await navigator.serviceWorker.register("/sw.js");
            const reg = await navigator.serviceWorker.ready;

            const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
            if (!vapidKey) {
                console.error("[push] VAPID key tidak ada");
                return false;
            }

            const existingSub = await reg.pushManager.getSubscription();
            if (existingSub) {
                await existingSub.unsubscribe();
            }

            // Buat subscription baru
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey),
            });

            const res = await fetch("/api/push/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(subscription.toJSON()),
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setIsSubscribed(true);
                return true;
            }

            console.error("[push] Server gagal simpan:", data.message);
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