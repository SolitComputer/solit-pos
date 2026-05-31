// src/components/layout/DashboardLayout.tsx
import Sidebar from "./Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f4f0]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div className="lg:hidden h-12 bg-white border-b border-gray-100 flex items-center px-4 flex-shrink-0">
          <div className="w-9" />
          <span className="text-sm font-bold text-[#1a1a2e] tracking-tight mx-auto">
            Solit POS
          </span>
          <div className="w-9" />
        </div>

        {/* ← Ganti ini */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-4 lg:p-5 max-w-[1280px]">
            {children}
          </div>
        </main>

      </div>
    </div>
  );
}