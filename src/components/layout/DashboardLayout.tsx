import Sidebar from "./Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar (spacer untuk hamburger button) */}
        <div className="lg:hidden h-12 bg-white border-b border-gray-100 flex items-center px-14 flex-shrink-0">
          <span className="text-sm font-semibold text-gray-700 tracking-tight">Solit POS</span>
        </div>
        <main className="flex-1 overflow-x-auto overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}