import { ChatProvider } from "@/contexts/ChatContext";
import { ChatManagerWrapper } from "@/components/ui/ChatManagerWrapper";
import { NotificationBanner } from "@/components/ui/NotificationBanner";
import ChatBarBackground from "@/components/ui/ChatBarBackground";
import MissionQuestTracker from "@/components/layout/MissionQuestTracker";
import BottomNavBar from "@/components/navigation/BottomNavBar";

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ChatProvider>
      <main className="pb-16 md:pb-0">
        {children}
      </main>

      {/* Bottom navigation — mobile only, role-based (lihat BottomNavBar.tsx) */}
      <BottomNavBar />

      <MissionQuestTracker />
      <NotificationBanner />

      {/* Floating chat button pojok kanan bawah — desktop/laptop saja,
          di HP fungsinya digantikan icon "Chat" di BottomNavBar */}
      <div className="hidden md:block">
        <ChatBarBackground />
      </div>

      {/* Chat panels (DM + GroupChat) — tanpa bottom bar strip */}
      <ChatManagerWrapper />
    </ChatProvider>
  );
}