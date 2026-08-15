"use client";

import React, { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useSoundMuted } from "@/lib/soundSettings";

interface SoundToggleButtonProps {
  className?: string;
  size?: "sm" | "md";
  showLabel?: boolean;
}

export default function SoundToggleButton({
  className = "",
  size = "md",
  showLabel = false,
}: SoundToggleButtonProps) {
  const [muted, toggleMuted] = useSoundMuted();
  const [showToast, setShowToast] = useState(false);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleMuted();
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  const isSmall = size === "sm";

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleToggle}
        title={muted ? "Suara Notifikasi: Dimatikan (Klik untuk Aktifkan)" : "Suara Notifikasi: Aktif (Klik untuk Mute)"}
        aria-label={muted ? "Aktifkan suara notifikasi" : "Matikan suara notifikasi"}
        className={`
          relative flex items-center justify-center transition-all duration-200 select-none active:scale-95
          ${isSmall ? "w-8 h-8 rounded-lg" : "w-9 h-9 rounded-xl"}
          ${
            muted
              ? "bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200/80 shadow-xs"
              : "bg-gray-100/80 text-gray-600 hover:bg-gray-200/80 hover:text-gray-900 border border-gray-200/60"
          }
          ${className}
        `}
      >
        {muted ? (
          <VolumeX
            size={isSmall ? 15 : 17}
            strokeWidth={2.2}
            className="transition-transform duration-200"
          />
        ) : (
          <Volume2
            size={isSmall ? 15 : 17}
            strokeWidth={2.2}
            className="transition-transform duration-200"
          />
        )}

        {/* Small badge dot if muted */}
        {muted && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
        )}

        {showLabel && (
          <span className="ml-2 text-xs font-semibold">
            {muted ? "Muted" : "Suara Aktif"}
          </span>
        )}
      </button>

      {/* Floating mini toast notification */}
      {showToast && (
        <div
          className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none whitespace-nowrap px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-lg transition-all animate-in fade-in slide-in-from-top-1"
          style={{
            background: muted ? "#e11d48" : "#1a1a2e",
            color: "#ffffff",
          }}
        >
          {muted ? "Suara Dimatikan (Muted)" : "Suara Diaktifkan 🔊"}
        </div>
      )}
    </div>
  );
}
