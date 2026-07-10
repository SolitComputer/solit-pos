"use client";
// src/app/dashboard/data-barang/page.tsx

import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, hasAnyRole } from "@/lib/permissions";
import { LaptopsContent } from "../laptops/LaptopsContent";
import AccessoriesContent from "../accessories/AccessoriesContent";

type TabKey = "laptops" | "accessories";

interface TabDef {
  key: TabKey;
  label: string;
  roles: UserRole[];
  icon: string; // Tabler icon name
}

const TABS: TabDef[] = [
  {
    key: "laptops",
    label: "Data Laptop",
    roles: [],
    icon: "ti-device-laptop",
  },
  {
    key: "accessories",
    label: "Aksesoris",
    roles: [],
    icon: "ti-devices",
  },
];

export default function DataBarangPage() {
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("laptops");

  // ── Load roles
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { signal: controller.signal });
        const data = await res.json();
        const roles: string[] =
          Array.isArray(data.user?.roles) && data.user.roles.length > 0
            ? data.user.roles
            : data.user?.role
            ? [data.user.role]
            : [];
        setUserRoles(roles as UserRole[]);
      } catch {
        setUserRoles([]);
      } finally {
        setRolesLoaded(true);
      }
    })();
    return () => controller.abort();
  }, []);

  // ── Deep-link: baca ?tab= dari URL
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get(
      "tab"
    ) as TabKey | null;
    if (t && TABS.some((tab) => tab.key === t)) setActiveTab(t);
  }, []);

  const visibleTabs = useMemo(
    () =>
      TABS.filter(
        (t) => t.roles.length === 0 || hasAnyRole(userRoles, t.roles)
      ),
    [userRoles]
  );

  // ── Fallback ke tab pertama kalau tab aktif tidak visible
  useEffect(() => {
    if (!rolesLoaded || visibleTabs.length === 0) return;
    if (!visibleTabs.some((t) => t.key === activeTab)) {
      setActiveTab(visibleTabs[0].key);
    }
  }, [rolesLoaded, visibleTabs, activeTab]);

  const changeTab = (key: TabKey) => {
    setActiveTab(key);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url.toString());
  };

  return (
    <DashboardLayout>
      {/* ── STICKY HEADER ─────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-200">

        {/* Top row: identity + badge */}
        <div className="flex items-center justify-between px-5 sm:px-7 pt-5 pb-4">
          <div className="flex items-center gap-3">
            {/* Icon */}
            <div className="w-9 h-9 bg-gray-900 rounded-[10px] flex items-center justify-center flex-shrink-0">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>

            {/* Title + subtitle */}
            <div>
              <h1 className="text-[14.5px] font-semibold text-gray-900 tracking-tight leading-none">
                Data Barang
              </h1>
              <p className="text-[11.5px] text-gray-400 mt-[3px] font-normal">
                Laptop &amp; aksesoris dalam satu tempat
              </p>
            </div>
          </div>

          {/* Kategori badge */}
          <span className="text-[11px] text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-3 py-1 font-normal tabular-nums">
            {visibleTabs.length} kategori
          </span>
        </div>

        {/* ── Tab strip — underline style ─────────────────────── */}
        <div className="flex overflow-x-auto scrollbar-hide px-5 sm:px-7 border-t border-gray-100">
          {visibleTabs.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                onClick={() => changeTab(tab.key)}
                className={[
                  "flex-shrink-0 flex items-center gap-2 h-11 px-1 mr-6",
                  "text-[13px] border-b-2 -mb-px transition-all duration-150 select-none",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1 rounded-sm",
                  isActive
                    ? "border-gray-900 text-gray-900 font-medium"
                    : "border-transparent text-gray-500 font-normal hover:text-gray-800 hover:border-gray-300",
                ]
                  .join(" ")}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={isActive ? "opacity-80" : "opacity-40"}
                >
                  {tab.icon === "ti-device-laptop" ? (
                    <>
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </>
                  ) : (
                    <>
                      <path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
                      <circle cx="8" cy="12" r="0.5" fill="currentColor" />
                      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
                      <circle cx="16" cy="12" r="0.5" fill="currentColor" />
                    </>
                  )}
                </svg>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── KONTEN TAB ────────────────────────────────────────── */}
      {activeTab === "laptops" && <LaptopsContent />}
      {activeTab === "accessories" && <AccessoriesContent />}

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </DashboardLayout>
  );
}