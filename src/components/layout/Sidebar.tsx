"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const menuIcons: Record<string, string> = {
  Dashboard: "📊",
  Riwayat: "📜",
  "Data Laptop": "💻",
  "Buat Payment": "💳",
};

const adminMenus = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Riwayat", href: "/dashboard/transactions" },
  { name: "Data Laptop", href: "/dashboard/laptops" },
  { name: "Buat Payment", href: "/payment/create" },
];

const salesMenus = [
  { name: "Buat Payment", href: "/payment/create" },
  { name: "Riwayat", href: "/dashboard/transactions" },
];

// ← Pindah keluar, terima props
function SidebarContent({
  user,
  loading,
  menus,
  pathname,
  onClose,
  onLogout,
}: {
  user: any;
  loading: boolean;
  menus: { name: string; href: string }[];
  pathname: string;
  onClose?: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-bold text-[#1a1a2e] tracking-tight">Solit POS</h1>
          {/* Tombol tutup — hanya muncul di mobile drawer */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition lg:hidden"
              aria-label="Tutup menu"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#1a1a2e] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {loading ? "·" : user?.name?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            {loading ? (
              <div className="space-y-1.5">
                <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
                <div className="h-2.5 w-12 bg-gray-100 rounded animate-pulse" />
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-800 truncate">{user?.name || "—"}</p>
                <p className="text-xs text-gray-400">{user?.role || "—"}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse mb-1" />
          ))
        ) : (
          menus.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all
                  ${isActive
                    ? "bg-[#1a1a2e] text-white"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}
                `}
              >
                <span className="text-base flex-shrink-0">{menuIcons[item.name] || "•"}</span>
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })
        )}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-gray-100">
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 text-gray-500 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-100 hover:text-gray-700 transition"
        >
          <span>🚪</span> Logout
        </button>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => { fetchUser(); }, []);
  useEffect(() => { setOpen(false); }, [pathname]);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/auth/me");
      const result = await res.json();
      setUser(result.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const menus = loading
    ? []
    : user?.role === "ADMIN"
    ? adminMenus
    : salesMenus;

  const contentProps = { user, loading, menus, pathname, onLogout: handleLogout };

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-xl bg-white border border-gray-200 shadow-sm text-gray-600 hover:bg-gray-50 transition"
        aria-label="Buka menu"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`
          lg:hidden fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-100 shadow-xl
          transform transition-transform duration-300 ease-in-out
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <SidebarContent {...contentProps} onClose={() => setOpen(false)} />
      </aside>

      {/* Desktop static */}
      <aside className="hidden lg:flex lg:flex-col w-60 xl:w-64 bg-white border-r border-gray-100 flex-shrink-0 h-screen sticky top-0">
        <SidebarContent {...contentProps} />
      </aside>
    </>
  );
}