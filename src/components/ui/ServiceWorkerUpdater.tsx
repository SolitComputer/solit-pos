"use client";

import { useEffect } from "react";

// Auto-reload sekali saat service worker baru ambil alih (skipWaiting + clientsClaim
// di sw.js bikin ini kejadian tanpa aksi user). Ini nyegah bundle JS lama (sebelum
// deploy) hydrate melawan HTML baru dari server -> hydration mismatch.
export default function ServiceWorkerUpdater() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker.getRegistration().then((reg) => {
      reg?.update().catch(() => {});
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
