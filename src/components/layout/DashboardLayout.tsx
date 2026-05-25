import Sidebar from "./Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#f5f4f0]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile topbar */}
        <div className="lg:hidden h-12 bg-white border-b border-gray-100 flex items-center px-4 flex-shrink-0">
          {/* Spacer untuk hamburger button (absolute positioned di Sidebar) */}
          <div className="w-9" />
          <span className="text-sm font-bold text-[#1a1a2e] tracking-tight mx-auto">
            Solit POS
          </span>
          <div className="w-9" />
        </div>
        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}