import type { Metadata } from "next";
import EmployeeBirthdaysClient from "./EmployeeBirthdaysClient";

export const metadata: Metadata = {
  title: "Ulang Tahun Karyawan | Solit POS",
  description: "Jadwal ulang tahun karyawan Solit 03.",
};

/**
 * Server Component tipis: hanya membungkus client component.
 * Data diambil di client karena halaman ini memakai `DashboardLayout`
 * dan sesi user dari `getCurrentUserClient()` — sama seperti halaman
 * dashboard lain yang sudah ada.
 */
export default function EmployeeBirthdaysPage() {
  return <EmployeeBirthdaysClient />;
}