"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, LayoutGrid, MessageCircle, User } from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Sosial", href: "/dashboard/social", icon: Users },
  { label: "Dashboard", href: "/dashboard", icon: LayoutGrid },
  { label: "Group Chat", href: "/dashboard/chat", icon: MessageCircle },
  { label: "Profil", href: "/dashboard/profile", icon: User },
];

function isActive(pathname: string, href: string) {
  // "/dashboard" harus exact match, biar ga selalu aktif di semua sub-route
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomNavBar() {
  const pathname = usePathname();

  return (
    <nav
      className="
        md:hidden
        fixed bottom-0 left-0 right-0 z-50
        bg-white/90 backdrop-blur-lg
        border-t border-gray-200
        pb-[env(safe-area-inset-bottom)]
      "
    >
      <div className="flex items-center justify-around h-16">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = isActive(pathname, href);

          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center justify-center gap-1 flex-1 h-full"
            >
              <div
                className={`
                  flex items-center justify-center
                  w-10 h-10 rounded-2xl
                  transition-colors
                  ${active ? "bg-violet-100" : "bg-transparent"}
                `}
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.5 : 2}
                  className={active ? "text-violet-600" : "text-gray-400"}
                />
              </div>
              <span
                className={`
                  text-[10px] font-black
                  ${active ? "text-violet-600" : "text-gray-400"}
                `}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}