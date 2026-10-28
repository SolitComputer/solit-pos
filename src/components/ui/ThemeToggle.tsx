"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export default function ThemeToggle({ rail = false }: { rail?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  // Sebelum mounted: render placeholder statis → hindari hydration mismatch
  if (!mounted) {
    return <div className={`w-full rounded-xl ${rail ? "h-10" : "h-9"}`} aria-hidden />;
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Mode terang" : "Mode gelap"}
      aria-label={isDark ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
      className={`w-full group flex items-center rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-all ${rail ? "justify-center py-2.5" : "gap-3 px-3 py-2"}`}
    >
      <span className="flex-shrink-0">
        {isDark ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
        )}
      </span>
      {!rail && <span>{isDark ? "Mode Terang" : "Mode Gelap"}</span>}
    </button>
  );
}