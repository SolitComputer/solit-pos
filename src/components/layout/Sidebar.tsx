"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Icon sederhana (gunakan emoji atau React Icons, biar soft)
// Jika tidak ingin pakai library, kita pakai teks/emoji saja.
const MenuIcon = ({ name }: { name: string }) => {
  const icons: Record<string, string> = {
    Dashboard: "📊",
    Riwayat: "📜",
    "Data Laptop": "💻",
    "Tambah Laptop": "➕",
    "Buat Payment": "💳",
  };
  return <span className="mr-3 text-gray-400 text-lg">{icons[name] || "•"}</span>;
};

export default function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<any>();

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    const response = await fetch("/api/auth/me");
    const result = await response.json();
    setUser(result.user);
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

  return (
    <aside className="w-72 bg-white border-r border-gray-100 flex flex-col h-screen sticky top-0 shadow-sm">
      {/* Header / User - tidak ikut scroll */}
      <div className="px-5 pt-6 pb-4 border-b border-gray-100 shrink-0">
        <h1 className="text-xl font-bold text-gray-800 tracking-tight">Solit POS</h1>
        <div className="mt-3">
          <p className="text-gray-700 text-sm font-medium">{user?.name || "Memuat..."}</p>
          <p className="text-xs text-gray-400 mt-0.5">{user?.role || "role"}</p>
        </div>
      </div>

      {/* Menu - area scrollable */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {menus?.map((item: any) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200
                ${isActive
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }
              `}
            >
              <MenuIcon name={item.name} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Tombol Logout - tetap di bawah, tidak ikut scroll */}
      <div className="p-4 border-t border-gray-100 shrink-0">
        <button
          onClick={handleLogout}
          className="
            w-full flex items-center justify-center gap-2 bg-gray-50 text-gray-700 
            rounded-xl py-2.5 text-sm font-medium hover:bg-gray-100 transition-all duration-200
          "
        >
          <span>🚪</span> Logout
        </button>
      </div>
    </aside>
  );
}