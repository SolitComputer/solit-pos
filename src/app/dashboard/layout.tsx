import { ChatProvider } from "@/contexts/ChatContext";
import { ChatManagerWrapper } from "@/components/ui/ChatManagerWrapper";
import { NotificationBanner } from "@/components/ui/NotificationBanner";
import ChatBarBackground from "@/components/ui/ChatBarBackground";
import MissionQuestTracker from "@/components/layout/MissionQuestTracker"; 
export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ChatProvider>
      <main>
        {children}
      </main>
      <MissionQuestTracker />
      <NotificationBanner />
      {/* Floating chat button pojok kanan bawah */}
      <ChatBarBackground />
      {/* Chat panels (DM + GroupChat) — tanpa bottom bar strip */}
      <ChatManagerWrapper />
    </ChatProvider>
  );
}