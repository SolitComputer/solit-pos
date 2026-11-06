import type { Metadata } from "next";
import DashboardLayout from "@/components/layout/DashboardLayout";
import CashflowPribadiClient from "./CashflowPribadiClient";

export const metadata: Metadata = {
  title: "Cashflow Pribadi — Solit POS",
  description: "Kelola keuangan pribadi Anda — pemasukan & pengeluaran.",
};

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <DashboardLayout>
      <CashflowPribadiClient />
    </DashboardLayout>
  );
}