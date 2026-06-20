// src/components/layout/DashboardLayout.tsx
"use client";

import Sidebar from "./Sidebar";
import { usePresence } from "@/hooks/usePresence";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

function ScrollRestorer() {
  const pathname = usePathname();
  const positions = useRef<Record<string, number>>({});
  const isFirstVisit = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const saved = positions.current[pathname];
    const firstVisit = !isFirstVisit.current[pathname];

    if (firstVisit) {
      isFirstVisit.current[pathname] = true;
      window.scrollTo({ top: 0, behavior: "instant" });
    } else if (saved !== undefined) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: saved, behavior: "instant" });
      });
    }

    const handleScroll = () => { positions.current[pathname] = window.scrollY; };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [pathname]);

  return null;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  usePresence();

  return (
    <div className="flex min-h-screen bg-[#f5f4f0]">
      <ScrollRestorer />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile topbar */}
        <div className="lg:hidden h-12 bg-white border-b border-gray-100 flex items-center px-4 flex-shrink-0 sticky top-0 z-30">
          <div className="w-9" />
          <span className="text-sm font-bold text-[#1a1a2e] tracking-tight mx-auto">Solit POS</span>
          <div className="w-9" />
        </div>

        {/* pb-10 = ruang untuk bar 32px + sedikit gap */}
        <main className="flex-1 pb-10">
          <div className="p-4 lg:p-5 max-w-[1280px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}