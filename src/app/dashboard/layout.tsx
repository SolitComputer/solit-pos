import DashboardLayout
  from "@/components/layout/DashboardLayout";

export default function Layout({
  children,
}: {
  children:
  React.ReactNode;
}) {
  return (
    <main className="p-3 lg:p-6 space-y-6 ">
      {children}
    </main>
  );
}