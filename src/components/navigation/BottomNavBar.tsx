"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, LayoutGrid, MessageCircle, User } from "lucide-react";
import { useChatContext } from "@/contexts/ChatContext";
import { useOverlay } from "@/contexts/OverlayContext";

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
  const { isOverlayOpen } = useOverlay();

  if (isOverlayOpen) return null;

  const activeIndex = NAV_ITEMS.findIndex(({ label, href }) => {
    const isGroupChat = label === "Group Chat";
    return isGroupChat ? openGroupChat : isActive(pathname, href);
  });

  const ActiveIcon = activeIndex >= 0 ? NAV_ITEMS[activeIndex].icon : null;

  return (
    <nav
      className="
        md:hidden
        fixed bottom-0 left-0 right-0 z-30
        w-full bg-white
        rounded-t-[26px]
        shadow-[0_-8px_30px_rgba(0,0,0,0.07)]
        pb-[env(safe-area-inset-bottom)]
        pt-1
      "
      style={{
        borderTop: "1px solid rgba(240,240,245,0.8)",
      }}
    >
      <div className="relative w-full">
        {/* Animated Elevated Active Indicator (Curved Wave + Elevated Circle) */}
        {activeIndex >= 0 && (
          <div
            className="absolute top-0 left-0 h-full pointer-events-none transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] z-20"
            style={{
              width: `${100 / NAV_ITEMS.length}%`,
              transform: `translateX(${activeIndex * 100}%)`,
            }}
          >
            {/* Seamless organic curved hump above the white bar */}
            <svg
              viewBox="0 0 100 32"
              preserveAspectRatio="none"
              className="absolute -top-[21px] left-1/2 -translate-x-1/2 w-[86px] h-[22px] pointer-events-none fill-white"
              style={{ filter: "drop-shadow(0 -3px 6px rgba(0,0,0,0.03))" }}
            >
              <path d="M 0 32 C 22 32 28 3 50 3 C 72 3 78 32 100 32 Z" />
            </svg>

            {/* Elevated Circular Button */}
            <div className="absolute -top-[23px] left-1/2 -translate-x-1/2 w-[52px] h-[52px] rounded-full bg-[#f4f2ff] border-[3px] border-[#5b4bf5] flex items-center justify-center shadow-[0_8px_20px_rgba(91,75,245,0.28)] transition-all duration-300">
              {ActiveIcon && (
                <ActiveIcon
                  size={23}
                  strokeWidth={2.4}
                  className="text-[#5b4bf5] transition-transform duration-200"
                />
              )}
            </div>
          </div>
        )}

        {/* Tab Items Grid */}
        <div className="relative flex items-center justify-around h-[58px] px-1">
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
                className="relative z-10 flex flex-1 h-full flex-col items-center justify-end pb-1.5 pt-1 select-none active:scale-95 transition-transform"
              >
                {/* Inactive Icon (hidden when active because active icon is in the elevated bubble) */}
                <div
                  className={`flex items-center justify-center transition-all duration-200 ${
                    active ? "opacity-0 -translate-y-2 pointer-events-none h-3" : "opacity-100 translate-y-0 h-6"
                  }`}
                >
                  <Icon
                    size={21}
                    strokeWidth={1.8}
                    className="text-gray-400"
                  />
                </div>

                {/* Text Label */}
                <span
                  className={`text-[10px] sm:text-[11px] tracking-tight transition-all duration-200 truncate max-w-[76px] ${
                    active
                      ? "font-bold text-gray-900 mt-1 scale-105"
                      : "font-medium text-gray-400 mt-0.5"
                  }`}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Bottom Home Indicator Bar (iOS / Modern Mobile style) */}
        <div className="w-28 h-1 bg-gray-300/80 rounded-full mx-auto mb-1.5 mt-0.5" />
      </div>
    </nav>
  );
}