"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, hasAnyRole } from "@/lib/permissions";
import { LaptopsContent } from "../laptops/page";
import { ReadyContent } from "../laptops/ready/page";
import { MinusContent } from "../laptops/minus/page";
import { AccessoriesContent } from "../accessories/page";

type TabKey = "laptops" | "ready" | "minus" | "accessories";

interface TabDef {
    key: TabKey;
    label: string;
    roles: UserRole[]; // kosong ([]) = semua role yang bisa buka menu ini boleh lihat tab
    icon: React.ReactNode;
}

// ⚠️ Isi `roles` tiap tab sesuai ROUTE_PERMISSIONS lama-mu kalau mau restriksi per-tab.
// Kalau dibiarkan [], tab tampil untuk semua yang bisa akses /dashboard/data-barang.
const TABS: TabDef[] = [
    {
        key: "laptops",
        label: "Data Laptop",
        roles: [],
        icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
        ),
    },
    {
        key: "ready",
        label: "Siap Jual",
        roles: [],
        icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12l2 2 4-4" />
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
        ),
    },
    {
        key: "minus",
        label: "Minus",
        roles: [],
        icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v4m0 4h.01" />
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
        ),
    },
    {
        key: "accessories",
        label: "Aksesoris",
        roles: [],
        icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
                <path d="M8 12h.01M12 12h.01M16 12h.01" />
            </svg>
        ),
    },
];

export default function DataBarangPage() {
    const [userRoles, setUserRoles] = useState<UserRole[]>([]);
    const [rolesLoaded, setRolesLoaded] = useState(false);
    const [activeTab, setActiveTab] = useState<TabKey>("laptops");

    // Ambil roles user (multi-role) — pola sama dgn halaman lain
    useEffect(() => {
        fetch("/api/auth/me")
            .then(r => r.json())
            .then(r => {
                const roles: string[] =
                    Array.isArray(r.user?.roles) && r.user.roles.length > 0
                        ? r.user.roles
                        : r.user?.role ? [r.user.role] : [];
                setUserRoles(roles as UserRole[]);
            })
            .catch(() => setUserRoles([]))
            .finally(() => setRolesLoaded(true));
    }, []);

    // Baca ?tab= dari URL saat mount → bisa deep-link / gak reset pas refresh
    useEffect(() => {
        const t = new URLSearchParams(window.location.search).get("tab") as TabKey | null;
        if (t && TABS.some(tab => tab.key === t)) setActiveTab(t);
    }, []);

    const visibleTabs = useMemo(
        () => TABS.filter(t => t.roles.length === 0 || hasAnyRole(userRoles, t.roles)),
        [userRoles]
    );

    // Kalau tab aktif ternyata gak boleh dilihat user → lompat ke tab valid pertama
    useEffect(() => {
        if (!rolesLoaded || visibleTabs.length === 0) return;
        if (!visibleTabs.some(t => t.key === activeTab)) setActiveTab(visibleTabs[0].key);
    }, [rolesLoaded, visibleTabs, activeTab]);

    const changeTab = (key: TabKey) => {
        setActiveTab(key);
        const url = new URL(window.location.href);
        url.searchParams.set("tab", key);
        window.history.replaceState(null, "", url.toString());
    };

    return (
        <DashboardLayout>
            {/* ── TAB BAR ─────────────────────────────────────────── */}
            <div className="sticky top-0 z-30 bg-[#F7F7F8]/90 backdrop-blur border-b border-gray-100 px-4 sm:px-6 lg:px-8 pt-4 pb-3">
                <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 bg-gray-800 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-base font-black text-gray-900 tracking-tight leading-none">Data Barang</h1>
                        <p className="text-[11px] text-gray-400 mt-0.5 font-medium">Laptop, siap jual, minus & aksesoris dalam satu tempat</p>
                    </div>
                </div>

                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                    {visibleTabs.map(tab => {
                        const isActive = tab.key === activeTab;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => changeTab(tab.key)}
                                className={`flex-shrink-0 flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                                    isActive
                                        ? "bg-gray-900 text-white shadow-sm"
                                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800"
                                }`}
                            >
                                <span className={isActive ? "text-white/90" : "text-gray-400"}>{tab.icon}</span>
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── ISI TAB AKTIF ───────────────────────────────────── */}
            {/* Hanya tab aktif yang di-mount → cuma dia yang fetch data */}
            {activeTab === "laptops" && <LaptopsContent />}
            {activeTab === "ready" && <ReadyContent />}
            {activeTab === "minus" && <MinusContent />}
            {activeTab === "accessories" && <AccessoriesContent />}

            <style jsx global>{`
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </DashboardLayout>
    );
}