import Sidebar
from "./Sidebar";

export default function DashboardLayout({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <div className="flex">

      <Sidebar />

      <main className="flex-1 bg-slate-100 min-h-screen">
        {children}
      </main>

    </div>
  );
}