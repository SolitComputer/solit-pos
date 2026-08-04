"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, LayoutGrid, MessageCircle, User } from "lucide-react";
import { useChatContext } from "@/contexts/ChatContext";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutGrid },
  { label: "Sosial", href: "/dashboard/social", icon: Users },
  { label: "Group Chat", href: "#", icon: MessageCircle },
  { label: "Profil", href: "/dashboard/profile", icon: User },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomNavBar() {
  const pathname = usePathname();
  const { openGroupChat, setOpenGroupChat } = useChatContext();

  const activeIndex = NAV_ITEMS.findIndex(({ label, href }) => {
    const isGroupChat = label === "Group Chat";
    return isGroupChat ? openGroupChat : isActive(pathname, href);
  });

  return (
    <nav
      className="
        md:hidden
        fixed bottom-0 left-0 right-0 z-[9999]
        px-5 pt-2
        pb-[calc(0.75rem+env(safe-area-inset-bottom))]
      "
    >
      <div className="relative flex items-center justify-around h-[60px] px-2 bg-white rounded-full shadow-[0_10px_30px_-6px_rgba(0,0,0,0.2)]">
        {activeIndex >= 0 && (
          <div
            className="absolute inset-y-0 left-0 flex items-center justify-center pointer-events-none transition-transform duration-300 ease-out"
            style={{
              width: `${100 / NAV_ITEMS.length}%`,
              transform: `translateX(${activeIndex * 100}%)`,
            }}
          >
            <div className="w-11 h-11 rounded-full bg-black shadow-md shadow-black/30" />
          </div>
        )}

        {NAV_ITEMS.map(({ label, href, icon: Icon }, idx) => {
          const isGroupChat = label === "Group Chat";
          const active = idx === activeIndex;

          return (
            <Link
              key={label}
              href={isGroupChat ? "#" : href}
              onClick={(e) => {
                if (isGroupChat) {
                  e.preventDefault();
                  setOpenGroupChat(!openGroupChat);
                }
              }}
              title={label}
              className="relative z-10 flex flex-1 h-full items-center justify-center"
            >
              <Icon
                size={active ? 20 : 21}
                strokeWidth={active ? 2.5 : 2}
                className={`transition-colors duration-300 ${active ? "text-white" : "text-gray-400"}`}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}