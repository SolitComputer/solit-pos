// src/app/dashboard/layout.tsx
import { ChatProvider } from "@/contexts/ChatContext";
import { ChatManagerWrapper } from "@/components/ui/ChatManagerWrapper";

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
      {/* ChatManager harus di luar <main> tapi masih di dalam ChatProvider */}
      <ChatManagerWrapper />
    </ChatProvider>
  );
}