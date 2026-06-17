// src/app/dashboard/layout.tsx
import { NotificationBanner } from "@/components/ui/NotificationBanner";

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <NotificationBanner />
    </>
  );
}