"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const menuIcons: Record<string, React.ReactNode> = {
  Dashboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  Riwayat: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  ),
  "Data Laptop": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  "Buat Payment": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
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

const operatorMenus = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Data Laptop", href: "/dashboard/laptops" },
];

const roleColors: Record<string, string> = {
  ADMIN: "bg-violet-100 text-violet-700",
  SALES: "bg-emerald-100 text-emerald-700",
  OPERATOR: "bg-blue-100 text-blue-700",
};

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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#1a1a2e] rounded-lg flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <rect x="3" y="3" width="8" height="8" rx="1.5" />
                <rect x="13" y="3" width="8" height="8" rx="1.5" opacity="0.5" />
                <rect x="3" y="13" width="8" height="8" rx="1.5" opacity="0.5" />
                <rect x="13" y="13" width="8" height="8" rx="1.5" />
              </svg>
            </div>
            <span className="text-sm font-bold text-[#1a1a2e] tracking-tight">Solit POS</span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition lg:hidden"
              aria-label="Tutup menu"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* User info */}
        {loading ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-100 animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
              <div className="h-2.5 w-14 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1a1a2e] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user?.name?.[0]?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800 truncate">{user?.name || "—"}</p>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${roleColors[user?.role] || "bg-gray-100 text-gray-500"}`}>
                {user?.role || "—"}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="mx-4 h-px bg-gray-100 flex-shrink-0" />

      {/* Nav — no overflow scroll, just fills remaining space */}
      <nav className="flex-1 py-3 px-3 space-y-0.5">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse mb-1" />
          ))
        ) : (
          menus.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all
                  ${isActive
                    ? "bg-[#1a1a2e] text-white"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"}
                `}
              >
                <span className={`flex-shrink-0 ${isActive ? "text-white/80" : "text-gray-400"}`}>
                  {menuIcons[item.name]}
                </span>
                <span>{item.name}</span>
              </Link>
            );
          })
        )}
      </nav>

      {/* Logout */}
      <div className="p-3 pb-5 border-t border-gray-100 flex-shrink-0">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all group"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 group-hover:text-red-500">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Keluar
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
    : user?.role === "OPERATOR"
    ? operatorMenus
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
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`
          lg:hidden fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-100 shadow-2xl
          transform transition-transform duration-300 ease-in-out
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <SidebarContent {...contentProps} onClose={() => setOpen(false)} />
      </aside>

      {/* Desktop */}
      <aside className="hidden lg:flex lg:flex-col w-56 xl:w-60 bg-white border-r border-gray-100 flex-shrink-0 h-screen sticky top-0 overflow-hidden">
        <SidebarContent {...contentProps} />
      </aside>
    </>
  );
}