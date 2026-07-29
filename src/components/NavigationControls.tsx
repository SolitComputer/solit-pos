"use client";

import { useRouter } from "next/navigation";
import { Undo2, Redo2 } from "lucide-react";

export default function NavigationControls() {
  const router = useRouter();

  return (
    <div
      className="fixed bottom-6 right-6 z-40 flex items-center gap-1 rounded-2xl
                 bg-[#1a1545]/90 backdrop-blur-md border border-white/10
                 shadow-lg px-2 py-1.5"
    >
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Kembali ke halaman sebelumnya"
        className="p-2 rounded-xl text-emerald-300 hover:bg-white/10
                   hover:text-emerald-200 active:scale-95 transition"
      >
        <Undo2 size={20} strokeWidth={2.5} />
      </button>

      <div className="w-px h-5 bg-white/10" />

      <button
        type="button"
        onClick={() => router.forward()}
        aria-label="Maju ke halaman berikutnya"
        className="p-2 rounded-xl text-violet-300 hover:bg-white/10
                   hover:text-violet-200 active:scale-95 transition"
      >
        <Redo2 size={20} strokeWidth={2.5} />
      </button>
    </div>
  );
}