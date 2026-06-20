// src/app/dashboard/layout.tsx
import { ChatProvider } from "@/contexts/ChatContext";
import { ChatManagerWrapper } from "@/components/ui/ChatManagerWrapper";
import { NotificationBanner } from "@/components/ui/NotificationBanner";
import ChatBarBackground from "@/components/ui/ChatBarBackground";

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
      {/* NotificationBanner */}
      <NotificationBanner />
      {/* ChatManager + GroupChat — di luar main agar ada di semua halaman */}
      {/* Bottom bar background strip (Facebook-style dark bar) */}
      <ChatBarBackground />
    </ChatProvider>
  );
}