import { notFound, redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUser } from "@/lib/auth";
import SalarySlipPrintClient from "./SalarySlipPrintClient";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MONTH_NAMES = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const ADMIN_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

type PageProps = {
    params: Promise<{ slipId: string }>;
};

export default async function SalarySlipPage({ params }: PageProps) {
    const { slipId } = await params;

    //  Auth guard — wajib login
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        redirect("/login");
    }

    // Fetch slip
    const { data: slip, error } = await supabase
        .from("salary_slips")
        .select("*")
        .eq("id", slipId)
        .single();

    if (error || !slip) {
        notFound();
    }

    //  Permission guard — hanya admin atau pemilik slip
    const isAdmin = ADMIN_ROLES.includes(currentUser.role);
    if (!isAdmin && slip.user_id !== currentUser.id) {
        redirect("/dashboard/attendance");
    }

    //  Non-admin hanya bisa lihat slip yang sudah dikirim (sent_at tidak null)
    if (!isAdmin && !slip.sent_at) {
        redirect("/dashboard/attendance");
    }

    // Fetch user info
    const { data: userData } = await supabase
        .from("users")
        .select("id, name, role, phone_number, shift")
        .eq("id", slip.user_id)
        .single();

    const monthLabel = MONTH_NAMES[slip.month - 1];
    const year = slip.year;
    const firstDay = `1 ${monthLabel} ${year}`;
    const lastDayNum = new Date(year, slip.month, 0).getDate();
    const lastDay = `${lastDayNum} ${monthLabel} ${year}`;

    return (
        <SalarySlipPrintClient
            slip={slip}
            user={userData ?? {
                id: slip.user_id,
                name: "Unknown",
                role: "-",
                phone_number: null,
                shift: "PAGI",
            }}
            periodLabel={`${firstDay} - ${lastDay}`}
            monthYear={`${monthLabel} ${year}`}
        />
    );
}