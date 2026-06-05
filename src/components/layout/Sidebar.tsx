"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { UserRole } from "@/lib/auth";

const CACHE_KEY = "solit_sidebar_user";

function getCachedUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCachedUser(user: any) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(user));
  } catch { }
}

interface MenuItem {
  name: string;
  href: string;
  icon: React.ReactNode;
}
interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const Icons = {
  dashboard: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  attendance: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2" />
    </svg>
  ),
  riwayat: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  laptop: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  garansi: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  payment: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  scanner: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M4 7V5a1 1 0 011-1h2" />
      <path d="M20 7V5a1 1 0 00-1-1h-2" />
      <path d="M4 17v2a1 1 0 001 1h2" />
      <path d="M20 17v2a1 1 0 01-1 1h-2" />
      <path d="M7 12h10" />
    </svg>
  ),
  logout: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  log: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  ),
  loginLog: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  ),
  reports: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  ),
  laptopReady: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M9 12l2 2 4-4" />
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  laptopMinus: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 9v4m0 4h.01" />
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  pendingOrders: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" ry="1" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  ),
};

const ROLE_MENUS: Record<UserRole, MenuGroup[]> = {
  ADMIN: [
    {
      label: "Overview",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
        { name: "Absensi", href: "/dashboard/attendance", icon: Icons.attendance },
        { name: "Log Aktivitas", href: "/dashboard/activity-log", icon: Icons.log },
        { name: "Log Login", href: "/dashboard/login-logs", icon: Icons.loginLog },
        { name: "Laporan Keuangan", href: "/dashboard/reports", icon: Icons.reports },
        { name: "Manajemen User", href: "/dashboard/users", icon: Icons.loginLog },
      ],
    },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Garansi", href: "/dashboard/warranty", icon: Icons.garansi },
        { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
        { name: "Laptop Minus", href: "/dashboard/laptops/minus", icon: Icons.laptopMinus },
      ],
    },
    {
      label: "Transaksi",
      items: [
        { name: "Buat Payment", href: "/payment/create", icon: Icons.payment },
        { name: "DP & Ambil Dulu", href: "/dashboard/pending-orders", icon: Icons.pendingOrders },
        { name: "Riwayat Transaksi", href: "/dashboard/transactions", icon: Icons.riwayat },
        { name: "Scanner", href: "/scan", icon: Icons.scanner },
      ],
    },
  ],
  TEKNISI: [
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Absensi", href: "/dashboard/attendance", icon: Icons.attendance },
        { name: "Garansi", href: "/dashboard/warranty", icon: Icons.garansi },
        { name: "Laptop Minus", href: "/dashboard/laptops/minus", icon: Icons.laptopMinus },
      ],
    },
    {
      label: "Tools",
      items: [{ name: "Scanner", href: "/scan", icon: Icons.scanner }],
    },
  ],
  KEPALA_SALES: [
    {
      label: "Overview",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
        { name: "Absensi", href: "/dashboard/attendance", icon: Icons.attendance },
      ],
    },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Garansi", href: "/dashboard/warranty", icon: Icons.garansi },
        { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
      ],
    },
    {
      label: "Transaksi",
      items: [
        { name: "Riwayat", href: "/dashboard/transactions", icon: Icons.riwayat }, // ✅
        { name: "Buat Payment", href: "/payment/create", icon: Icons.payment },
        { name: "DP & Ambil Dulu", href: "/dashboard/pending-orders", icon: Icons.pendingOrders },
        { name: "Scanner", href: "/scan", icon: Icons.scanner },
      ],
    },
  ],
  CREW_SALES: [
    {
      label: "Overview",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
        { name: "Absensi", href: "/dashboard/attendance", icon: Icons.attendance },
      ],
    },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Garansi", href: "/dashboard/warranty", icon: Icons.garansi },
        { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
      ],
    },
    {
      label: "Transaksi",
      items: [
        { name: "Riwayat", href: "/dashboard/transactions", icon: Icons.riwayat }, // ✅
        { name: "Buat Payment", href: "/payment/create", icon: Icons.payment },
        { name: "DP & Ambil Dulu", href: "/dashboard/pending-orders", icon: Icons.pendingOrders },
        { name: "Scanner", href: "/scan", icon: Icons.scanner },
      ],
    },
  ],
  ACCOUNTING: [
    {
      label: "Overview",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
        { name: "Absensi", href: "/dashboard/attendance", icon: Icons.attendance },
        { name: "Laporan Keuangan", href: "/dashboard/reports", icon: Icons.reports },
      ],
    },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Garansi", href: "/dashboard/warranty", icon: Icons.garansi },
      ],
    },
    {
      label: "Transaksi",
      items: [
        { name: "Riwayat", href: "/dashboard/transactions", icon: Icons.riwayat }, // ✅
        { name: "DP & Ambil Dulu", href: "/dashboard/pending-orders", icon: Icons.pendingOrders },
      ],
    },
  ],
  PENGELOLA_BARANG: [
    {
      label: "Overview",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
        { name: "Absensi", href: "/dashboard/attendance", icon: Icons.attendance },
        { name: "Riwayat", href: "/dashboard/transactions", icon: Icons.riwayat },
      ],
    },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Laptop Minus", href: "/dashboard/laptops/minus", icon: Icons.laptopMinus },
      ],
    },
    {
      label: "Tools",
      items: [
        { name: "Scanner", href: "/scan", icon: Icons.scanner },
      ],
    },
  ],
  PENGANTARAN: [
    {
      label: "Overview",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
        { name: "Absensi", href: "/dashboard/attendance", icon: Icons.attendance },
      ],
    },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Garansi", href: "/dashboard/warranty", icon: Icons.garansi },
        { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
      ],
    },
    {
      label: "Transaksi",
      items: [
        { name: "Riwayat", href: "/dashboard/transactions", icon: Icons.riwayat }, // ✅
        { name: "Buat Payment", href: "/payment/create", icon: Icons.payment },
        { name: "DP & Ambil Dulu", href: "/dashboard/pending-orders", icon: Icons.pendingOrders },
        { name: "Scanner", href: "/scan", icon: Icons.scanner },
      ],
    },
  ],
  MARKETING: [
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Absensi", href: "/dashboard/attendance", icon: Icons.attendance },
        { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
      ],
    },
  ],
  KEBERSIHAN: [
    {
      label: "Overview",
      items: [
        { name: "Absensi", href: "/dashboard/attendance", icon: Icons.attendance },
        { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
        { name: "Riwayat", href: "/dashboard/transactions", icon: Icons.riwayat },
      ],
    },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
      ],
    },
  ],
  KEPALA_MARKETING: [
    {
      label: "Overview",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
        { name: "Absensi", href: "/dashboard/attendance", icon: Icons.attendance },
      ],
    },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Garansi", href: "/dashboard/warranty", icon: Icons.garansi },
        { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
      ],
    },
    {
      label: "Transaksi", 
      items: [
        { name: "Riwayat", href: "/dashboard/transactions", icon: Icons.riwayat },
      ],
    },
  ],
};

const ROLE_META: Record<UserRole, { label: string; className: string }> = {
  ADMIN: { label: "Admin / CEO", className: "bg-violet-50 text-violet-700" },
  KEPALA_SALES: { label: "Kepala Sales", className: "bg-emerald-50 text-emerald-700" },
  CREW_SALES: { label: "Crew Sales", className: "bg-sky-50 text-sky-700" },
  ACCOUNTING: { label: "Accounting", className: "bg-amber-50 text-amber-700" },
  PENGELOLA_BARANG: { label: "Pengelola Barang", className: "bg-blue-50 text-blue-700" },
  TEKNISI: { label: "Teknisi", className: "bg-orange-50 text-orange-700" },
  PENGANTARAN: { label: "Pengantaran", className: "bg-teal-50 text-teal-700" },
  MARKETING: { label: "Marketing", className: "bg-pink-50 text-pink-700" },
  KEBERSIHAN: { label: "Kebersihan", className: "bg-cyan-50 text-cyan-700" },
  KEPALA_MARKETING: { label: "Kepala Marketing", className: "bg-rose-50 text-rose-700" },
};

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function NavItem({ item, isActive, onClick }: { item: MenuItem; isActive: boolean; onClick?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`
        group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium
        transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30
        ${isActive
          ? "bg-[#1a1a2e] text-white shadow-sm"
          : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
        }
      `}
    >
      <span className={`flex-shrink-0 ${isActive ? "text-white/70" : "text-gray-400 group-hover:text-gray-600"}`}>
        {item.icon}
      </span>
      <span className="flex-1 truncate">{item.name}</span>
    </Link>
  );
}

function SidebarContent({ user, loading, groups, pathname, onClose, onLogout }: {
  user: any; loading: boolean; groups: MenuGroup[]; pathname: string;
  onClose?: () => void; onLogout: () => void;
}) {
  const roleMeta = user?.role ? ROLE_META[user.role as UserRole] : null;
  const initials = user?.name ? getInitials(user.name) : "?";

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      <div className="px-4 pt-5 pb-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0 bg-[#1a1a2e]">
              <img src="/assets/solit03.jpeg" alt="Solit" className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
            <span className="text-sm font-bold text-[#1a1a2e] tracking-tight">Solit POS</span>
          </div>
          {onClose && (
            <button onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
              aria-label="Tutup sidebar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

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
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800 truncate">{user?.name || "—"}</p>
              {roleMeta && (
                <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-md mt-0.5 ${roleMeta.className}`}>
                  {roleMeta.label}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mx-4 h-px bg-gray-100 flex-shrink-0" />

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-3 space-y-3"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}>
        {loading ? (
          <div className="space-y-1 pt-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-9 rounded-xl bg-gray-100 animate-pulse mb-1"
                style={{ animationDelay: `${i * 40}ms` }} />
            ))}
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.07em] px-3 mb-1">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = (() => {
                    if (pathname === item.href) return true;
                    if (item.href === "/dashboard") return false;
                    if (item.href === "/dashboard/laptops") {
                      return (
                        pathname === "/dashboard/laptops" ||
                        (pathname.startsWith("/dashboard/laptops/") &&
                          !pathname.startsWith("/dashboard/laptops/ready") &&
                          !pathname.startsWith("/dashboard/laptops/minus"))
                      );
                    }
                    return pathname.startsWith(item.href);
                  })();
                  return (
                    <NavItem key={item.href} item={item} isActive={isActive} onClick={onClose} />
                  );
                })}
              </div>
            </div>
          ))
        )}
      </nav>

      <div className="p-3 pb-5 border-t border-gray-100 flex-shrink-0">
        <button onClick={onLogout}
          className="w-full group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all">
          <span className="flex-shrink-0 group-hover:text-red-500">{Icons.logout}</span>
          <span>Keluar</span>
        </button>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<any>(() => getCachedUser());
  const [loading, setLoading] = useState(!getCachedUser());
  const [open, setOpen] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const fetchUser = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          window.location.href = "/login";
          return;
        }
        const result = await res.json();
        const fresh = result.user ?? null;
        setUser(fresh);
        setCachedUser(fresh);
      } catch {
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  const handleLogout = async () => {
    sessionStorage.removeItem(CACHE_KEY);
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const groups: MenuGroup[] = user?.role ? (ROLE_MENUS[user.role as UserRole] ?? []) : [];
  const contentProps = { user, loading, groups, pathname, onLogout: handleLogout };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-xl bg-white border border-gray-200 shadow-sm text-gray-600 hover:bg-gray-50 transition"
        aria-label="Buka menu">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200
          ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setOpen(false)} aria-hidden="true" />

      <aside className={`lg:hidden fixed top-0 left-0 z-50 h-full w-56 bg-white border-r border-gray-100 shadow-2xl transition-transform duration-250 ease-out will-change-transform
        ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <SidebarContent {...contentProps} onClose={() => setOpen(false)} />
      </aside>

      <aside className="hidden lg:flex lg:flex-col w-56 xl:w-60 bg-white border-r border-gray-100 flex-shrink-0 h-screen sticky top-0 overflow-hidden">
        <SidebarContent
          user={user}
          loading={loading}
          groups={groups}
          pathname={pathname}
          onLogout={handleLogout}
        />
      </aside>
    </>
  );
}