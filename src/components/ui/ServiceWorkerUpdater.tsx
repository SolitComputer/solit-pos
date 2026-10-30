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

      // Anti-loop lintas-reload: variabel `reloaded` reset tiap halaman dimuat,
      // jadi perlu pengaman yang bertahan antar-reload. Kalau controllerchange
      // memicu reload lagi < 10 detik setelah reload sebelumnya, hentikan —
      // mencegah SW yang terus "aktif ulang" bikin halaman reload tanpa henti.
      const SW_RELOAD_TS_KEY = "sw-controllerchange-ts";
      const lastReload = Number(sessionStorage.getItem(SW_RELOAD_TS_KEY) || 0);
      if (Date.now() - lastReload < 10_000) return;

      sessionStorage.setItem(SW_RELOAD_TS_KEY, String(Date.now()));
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
