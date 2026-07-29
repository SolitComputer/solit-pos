"use client";

import { useRouter } from "next/navigation";

interface BackButtonProps {
  fallbackHref?: string;
  className?: string;
}

export default function BackButton({
  fallbackHref = "/dashboard",
  className = "",
}: BackButtonProps) {
  const router = useRouter();

  const handleBack = () => {
    // Kalau ada history di tab ini, mundur normal.
    // Kalau tidak (misal user buka link langsung/refresh), lempar ke fallback.
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="Kembali"
      className={`flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 active:scale-95 transition-all ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
  );
}