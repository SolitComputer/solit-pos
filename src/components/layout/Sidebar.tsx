"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const menuIcons: Record<string, string> = {
  Dashboard: "📊",
  Riwayat: "📜",
  "Data Laptop": "💻",
  "Tambah Laptop": "➕",
  "Buat Payment": "💳",
};

export default function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchUser();
  }, []);

  // Tutup sidebar saat route berubah (mobile)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const fetchUser = async () => {
    try {
      const response = await fetch("/api/auth/me");
      const result = await response.json();
      setUser(result.user);
    } catch {
      setUser(null);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const adminMenus = [
    { name: "Dashboard", href: "/dashboard" },
    { name: "Riwayat", href: "/dashboard/transactions" },
    { name: "Data Laptop", href: "/dashboard/laptops" },
    { name: "Tambah Laptop", href: "/dashboard/laptops/create" },
    { name: "Buat Payment", href: "/payment/create" },
  ];

  const salesMenus = [
    { name: "Buat Payment", href: "/payment/create" },
    { name: "Riwayat", href: "/dashboard/transactions" },
  ];

  const menus = user?.role === "ADMIN" ? adminMenus : salesMenus;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-800 tracking-tight">Solit POS</h1>
        <div className="mt-3 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-sm font-semibold flex-shrink-0">
            {user?.name?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{user?.name || "Memuat..."}</p>
            <p className="text-xs text-gray-400">{user?.role || "—"}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
        {menus?.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all
                ${isActive
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"}
              `}
            >
              <span className="text-base flex-shrink-0 opacity-70">{menuIcons[item.name] || "•"}</span>
              <span className="truncate">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 bg-gray-50 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-100 transition"
        >
          <span>🚪</span> Logout
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile: hamburger button */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-3.5 left-4 z-50 p-2 rounded-lg bg-white border border-gray-200 shadow-sm text-gray-600 hover:bg-gray-50 transition"
        aria-label="Buka menu"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile: overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile: drawer */}
      <aside
        className={`
          lg:hidden fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-100 shadow-xl
          transform transition-transform duration-300 ease-in-out
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <button
          onClick={() => setOpen(false)}
          className="absolute top-3.5 right-3.5 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          aria-label="Tutup menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <SidebarContent />
      </aside>

      {/* Desktop: static sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-60 xl:w-64 bg-white border-r border-gray-100 flex-shrink-0 h-screen sticky top-0">
        <SidebarContent />
      </aside>
    </>
  );
}