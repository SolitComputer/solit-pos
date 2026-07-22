  "use client";

  import { useEffect, useMemo, useState } from "react";
  import DashboardLayout from "@/components/layout/DashboardLayout";
  import { UserRole, hasAnyRole } from "@/lib/permissions";
  import { LaptopsContent } from "../laptops/LaptopsContent";
  import AccessoriesContent from "../accessories/AccessoriesContent";
  import OutflowsContent from "./OutflowsContent";
  import { ITEM_OUTFLOW_ROLES } from "@/lib/permissions";
  import PriceListPedagangTab from "@/components/inventory/price-list-pedagang/page";
  import { PRICELIST_PEDAGANG_ROLES } from "@/lib/pricelistPedagang";


  type TabKey = "laptops" | "accessories" | "outflows" | "pedagang";

  interface TabDef {
    key: TabKey;
    label: string;
    roles: UserRole[];
    icon: string;
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
    {
      key: "outflows",
      label: "Pengambilan Barang",
      roles: ITEM_OUTFLOW_ROLES,
      icon: "ti-history",
    },
    {
      key: "pedagang",
      label: "Price List Pedagang",
      roles: PRICELIST_PEDAGANG_ROLES,
      icon: "ti-tag",
    },
  ];

  function getTabIcon(icon: string, className: string) {
    switch (icon) {
      case "ti-device-laptop":
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        );
      case "ti-devices":
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
            <circle cx="8" cy="12" r="0.5" fill="currentColor" />
            <circle cx="12" cy="12" r="0.5" fill="currentColor" />
            <circle cx="16" cy="12" r="0.5" fill="currentColor" />
          </svg>
        );
      case "ti-history":
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        );
      case "ti-tag":
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.17L4 3a1 1 0 0 0-1 1l.17 5.59a2 2 0 0 0 .66 1.41l9.58 9.58a2 2 0 0 0 2.83 0l4.35-4.35a2 2 0 0 0 0-2.83Z" />
            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
          </svg>
        );
      default:
        return null;
    }
  }

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
        {/* ── PAGE HEADER — scrolls away normally ───────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden mb-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 gap-3 sm:gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-9 sm:h-9 bg-gray-900 rounded-[10px] flex items-center justify-center flex-shrink-0 shadow-md">
                <svg
                  className="w-[18px] h-[18px] sm:w-[17px] sm:h-[17px]"
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
              <div className="min-w-0 flex-1">
                <h1 className="text-[15px] sm:text-[14.5px] font-bold text-gray-900 tracking-tight leading-none truncate">
                  Data Barang
                </h1>
                <p className="text-[11.5px] text-gray-400 mt-1 font-normal truncate">
                  Laptop &amp; aksesoris dalam satu tempat
                </p>
              </div>
            </div>
            <span className="inline-flex self-start sm:self-auto text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-3 py-1 font-medium tabular-nums">
              {visibleTabs.length} kategori
            </span>
          </div>
        </div>

        {/* ── STICKY TAB STRIP — nempel di atas saat scroll ─────── */}
        {/*
          Mobile  : top-12 (di bawah topbar 48px dari DashboardLayout)
          Desktop : top-0  (gak ada topbar)
          Negative margin + padding trick supaya sticky full-width
        */}
        <div className="sticky top-12 lg:top-0 z-30 -mx-4 lg:-mx-5 px-4 lg:px-5">
          <div className="bg-white/95 backdrop-blur-md border border-gray-200 border-t-0 rounded-b-2xl shadow-sm overflow-hidden">
            <div className="flex overflow-x-auto scrollbar-hide px-4 sm:px-6">
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
                    ].join(" ")}
                  >
                    {getTabIcon(tab.icon, `w-4 h-4 ${isActive ? "opacity-80" : "opacity-40"}`)}
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── KONTEN TAB ────────────────────────────────────────── */}
        <div className="mt-5">
          {activeTab === "laptops" && <LaptopsContent />}
          {activeTab === "accessories" && <AccessoriesContent />}
          {activeTab === "outflows" && <OutflowsContent />}
          {activeTab === "pedagang" && <PriceListPedagangTab />}
        </div>

        <style jsx global>{`
          .scrollbar-hide::-webkit-scrollbar { display: none; }
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        `}</style>
      </DashboardLayout>
    );
  }