"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error
    console.error("Global error caught:", error);

    const errorMessage = error.message.toLowerCase();
    const isChunkLoadError =
      error.name === "ChunkLoadError" ||
      errorMessage.includes("failed to fetch dynamically imported module") ||
      errorMessage.includes("serviceworker") ||
      errorMessage.includes("loading chunk") ||
      errorMessage.includes("unexpected token") ||
      errorMessage.includes("mencegat"); // from "ServiceWorker mencegat permintaan"

    if (!isChunkLoadError) return;

    // Anti-loop: auto-reload hanya kalau reload terakhir TIDAK baru saja terjadi.
    // Kalau chunk error muncul lagi < 10 detik setelah reload, artinya reload
    // barusan tidak menyelesaikan masalah (indikasi loop) — berhenti, dan biarkan
    // tombol "Muat Ulang Halaman" muncul supaya user tidak terjebak reload terus.
    const RELOAD_TS_KEY = "chunk-reload-ts";
    const lastReload = Number(sessionStorage.getItem(RELOAD_TS_KEY) || 0);

    if (Date.now() - lastReload < 10_000) {
      console.warn("Chunk error berulang < 10 dtk — auto-reload dihentikan (anti-loop).");
      return;
    }

    sessionStorage.setItem(RELOAD_TS_KEY, String(Date.now()));
    console.log("Chunk load error terdeteksi — reload sekali untuk ambil chunk baru...");
    window.location.reload();
  }, [error]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md text-center">
        <h2 className="mb-4 text-2xl font-bold text-gray-900">
          Sinkronisasi Update
        </h2>
        <p className="mb-6 text-gray-600 text-sm">
          Aplikasi menerima pembaruan sistem terbaru atau terjadi kendala memori. 
          Silakan muat ulang halaman ini untuk melanjutkan.
        </p>
        <button
          onClick={() => {
            window.location.reload();
          }}
          className="rounded-lg bg-[#1a1a2e] px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-[#2d2d4a] transition-colors"
        >
          Muat Ulang Halaman
        </button>
      </div>
    </div>
  );
}
