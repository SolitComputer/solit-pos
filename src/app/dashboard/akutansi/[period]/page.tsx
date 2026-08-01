import { notFound } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { isValidPeriod } from "@/lib/accounting";
import AkuntansiTabs from "@/components/akutansi/AkuntansiTabs";

export default async function AkuntansiPeriodPage({
  params,
}: {
  params: Promise<{ period: string }>;
}) {
  const { period } = await params;
  if (!isValidPeriod(period)) notFound();

  return (
    <DashboardLayout>
      <AkuntansiTabs period={period} />
    </DashboardLayout>
  );
}