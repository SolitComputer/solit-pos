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

    if (isChunkLoadError) {
      console.log("Chunk load error detected, forcing reload...");
      // Forcing a hard reload to fetch new JS chunks from the server
      window.location.reload();
    }
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
