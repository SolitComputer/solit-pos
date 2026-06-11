import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import SalarySlipPrintClient from "./SalarySlipPrintClient";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MONTH_NAMES = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

type PageProps = {
    params: Promise<{
        slipId: string;
    }>;
};

export default async function SalarySlipPage({
    params,
}: PageProps) {
    const { slipId } = await params;

    // Fetch slip
    const { data: slip, error } = await supabase
        .from("salary_slips")
        .select("*")
        .eq("id", slipId)
        .single();

    if (error || !slip) {
        notFound();
    }

    // Fetch user info
    const { data: userData } = await supabase
        .from("users")
        .select("id, name, role, phone_number, shift")
        .eq("id", slip.user_id)
        .single();

    // Ambil label periode
    const monthLabel = MONTH_NAMES[slip.month - 1];
    const year = slip.year;

    // Hitung hari pertama dan terakhir bulan
    const firstDay = `1 ${monthLabel} ${year}`;
    const lastDayNum = new Date(year, slip.month, 0).getDate();
    const lastDay = `${lastDayNum} ${monthLabel} ${year}`;

    return (
        <SalarySlipPrintClient
            slip={slip}
            user={userData ?? { id: slip.user_id, name: "Unknown", role: "-", phone_number: null, shift: "PAGI" }}
            periodLabel={`${firstDay} - ${lastDay}`}
            monthYear={`${monthLabel} ${year}`}
        />
    );
}