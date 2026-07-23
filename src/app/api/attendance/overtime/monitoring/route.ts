import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Halaman "Monitoring CEO" cuma untuk ADMIN & PROGRAMMER
// (beda dari FULL_ACCESS di /api/attendance/overtime yang juga include ASISTEN_CEO)
const MONITORING_CEO_ROLES = ["ADMIN", "PROGRAMMER"];
const PAYABLE_STATUSES = ["COMPLETED", "NEED_PROOF"];
const VALID_SORT_BY = ["duration", "pay", "date"] as const;
type SortBy = (typeof VALID_SORT_BY)[number];

// ── Pemisahan grup: Karyawan (non-PKL) vs PKL ──
const VALID_GROUPS = ["all", "karyawan", "pkl"] as const;
type GroupFilter = (typeof VALID_GROUPS)[number];

function isPklRole(role?: string | null): boolean {
    if (!role) return false;
    const r = role.toUpperCase();
    return r === "PKL" || r.startsWith("PKL_");
}

type OvertimeRowRaw = {
    id: string;
    user_id: string;
    request_date: string;
    reason: string | null;
    requested_start: string | null;
    status: string;
    approved_by: string | null;
    approved_at: string | null;
    scheduled_start: string | null;
    scheduled_end: string | null;
    actual_start: string | null;
    actual_end: string | null;
    rate_per_hour: number | null;
    total_pay: number | null;
    duration_minutes: number | null;
    work_description: string | null;
    proof_photo_url: string | null;
    auto_completed: boolean;
    is_holiday: boolean;
    is_late: boolean | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
};

export async function GET(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ success: false }, { status: 401 });

        const userRoles: string[] =
            Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : [user.role];
        const isAllowed = userRoles.some((r) => MONITORING_CEO_ROLES.includes(r));
        if (!isAllowed) {
            return NextResponse.json(
                { success: false, message: "Halaman ini khusus untuk Admin/Programmer" },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const status = searchParams.get("status");
        const search = searchParams.get("search")?.trim().toLowerCase() ?? "";
        const userId = searchParams.get("userId"); // untuk drill-down per karyawan

        const sortByParam = searchParams.get("sortBy") ?? "duration";
        const sortBy: SortBy = (VALID_SORT_BY as readonly string[]).includes(sortByParam)
            ? (sortByParam as SortBy)
            : "duration";
        const sortOrder: "asc" | "desc" = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

        const groupParam = searchParams.get("group") ?? "all";
        const group: GroupFilter = (VALID_GROUPS as readonly string[]).includes(groupParam)
            ? (groupParam as GroupFilter)
            : "all";

        if (!startDate || !endDate) {
            return NextResponse.json(
                { success: false, message: "startDate dan endDate wajib diisi (format YYYY-MM-DD)" },
                { status: 400 }
            );
        }
        if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
            return NextResponse.json(
                { success: false, message: "startDate tidak boleh lebih besar dari endDate" },
                { status: 400 }
            );
        }

        let q = supabase
            .from("overtime_requests")
            .select(`
        id, user_id, request_date, reason, requested_start,
        status, approved_by, approved_at,
        scheduled_start, scheduled_end, actual_start, actual_end,
        rate_per_hour, total_pay, duration_minutes,
        work_description, proof_photo_url, auto_completed,
        is_holiday, is_late, completed_at, created_at, updated_at
      `)
            .gte("request_date", startDate)
            .lte("request_date", endDate);

        if (status) {
            const statusList = status.split(",").map((s) => s.trim()).filter(Boolean);
            q = statusList.length > 1 ? q.in("status", statusList) : q.eq("status", statusList[0]);
        }

        if (userId) {
            q = q.eq("user_id", userId);
        }

        const { data: rows, error } = await q;
        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        const allRows = (rows ?? []) as OvertimeRowRaw[];

        // ── Enrich dengan data user (karyawan + approver) ──
        const approverIds = allRows.filter((r) => r.approved_by).map((r) => r.approved_by as string);
        const userIds = [...new Set([...allRows.map((r) => r.user_id), ...approverIds])];

        const { data: usersData } = userIds.length
            ? await supabase.from("users").select("id, name, role").in("id", userIds)
            : { data: [] as { id: string; name: string; role: string }[] };

        const usersMap: Record<string, { id: string; name: string; role: string }> = {};
        (usersData ?? []).forEach((u) => { usersMap[u.id] = u; });

        let enriched = allRows.map((o) => ({
            ...o,
            users: usersMap[o.user_id] ?? null,
            approver: o.approved_by ? usersMap[o.approved_by] ?? null : null,
        }));

        if (search) {
            enriched = enriched.filter((o) => o.users?.name?.toLowerCase().includes(search));
        }

        // ── Hitung jumlah tiap grup SEBELUM difilter (untuk badge tab di UI) ──
        const groupCounts = {
            karyawan: enriched.filter((o) => !isPklRole(o.users?.role)).length,
            pkl: enriched.filter((o) => isPklRole(o.users?.role)).length,
        };

        if (group === "karyawan") {
            enriched = enriched.filter((o) => !isPklRole(o.users?.role));
        } else if (group === "pkl") {
            enriched = enriched.filter((o) => isPklRole(o.users?.role));
        }

        // ── Sorting ──
        const dir = sortOrder === "asc" ? 1 : -1;
        enriched.sort((a, b) => {
            if (sortBy === "pay") return ((a.total_pay ?? 0) - (b.total_pay ?? 0)) * dir;
            if (sortBy === "date") {
                return (new Date(a.request_date).getTime() - new Date(b.request_date).getTime()) * dir;
            }
            return ((a.duration_minutes ?? 0) - (b.duration_minutes ?? 0)) * dir;
        });

        // ── Summary: kartu statistik & mini-leaderboard ──
        const payableRows = enriched.filter((o) => PAYABLE_STATUSES.includes(o.status));
        const totalMinutes = payableRows.reduce((s, o) => s + (o.duration_minutes ?? 0), 0);
        const totalPay = payableRows.reduce((s, o) => s + (o.total_pay ?? 0), 0);
        const uniqueEmployees = new Set(enriched.map((o) => o.user_id)).size;

        const statusCounts: Record<string, number> = {};
        enriched.forEach((o) => { statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1; });

        const perEmployee: Record<
            string,
            {
                id: string;
                name: string;
                role: string;
                sessions: number;
                minutes: number;
                pay: number;
            }
        > = {};
        payableRows.forEach((o) => {
            const acc = perEmployee[o.user_id] ?? {
                id: o.user_id,
                name: o.users?.name ?? "—",
                role: o.users?.role ?? "—",
                sessions: 0,
                minutes: 0,
                pay: 0,
            };
            acc.sessions += 1;
            acc.minutes += o.duration_minutes ?? 0;
            acc.pay += o.total_pay ?? 0;
            perEmployee[o.user_id] = acc;
        });
        const topEmployees = Object.values(perEmployee)
            .sort((a, b) => b.minutes - a.minutes)
            .slice(0, 5);

        return NextResponse.json({
            success: true,
            data: enriched,
            summary: {
                totalSessions: enriched.length,
                payableSessions: payableRows.length,
                totalMinutes,
                totalHours: Math.round((totalMinutes / 60) * 10) / 10,
                totalPay,
                uniqueEmployees,
                statusCounts,
                groupCounts,
                topEmployees,
                avgMinutesPerSession: payableRows.length
                    ? Math.round(totalMinutes / payableRows.length)
                    : 0,
            },
        });
    } catch (err: any) {
        console.error("[CEO Overtime Monitoring GET Error]", err);
        return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
    }
}