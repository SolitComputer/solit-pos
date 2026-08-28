"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[kendaraan] error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-[#F7F7F8] p-6">
      <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 text-red-500 flex items-center justify-center mx-auto mb-3">
          <AlertTriangle size={22} />
        </div>
        <h2 className="text-sm font-black text-gray-900 mb-1">Terjadi Kesalahan</h2>
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          Gagal memuat halaman kendaraan. Coba muat ulang.
        </p>
        <button
          onClick={reset}
          className="h-10 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition active:scale-95"
        >
          <RefreshCw size={14} /> Coba Lagi
        </button>
      </div>
    </div>
  );
}
