import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getWIBNow() {
    return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

// ✅ Aturan poin lembur: tiap blok 2 jam PENUH lembur (dijumlah dalam 1 hari
// yang sama) = 2 poin. Sisa di bawah 2 jam tidak dihitung — 3 jam tetap 2
// poin (bukan 3), 1 jam / 1 jam 30 menit = 0 poin. Formula: floor(menit/120)*2.
const MINUTES_PER_BLOCK = 120;
const POINTS_PER_BLOCK = 2;

function computeDailyOvertimePoints(totalMinutesThatDay: number): number {
    return Math.floor(totalMinutesThatDay / MINUTES_PER_BLOCK) * POINTS_PER_BLOCK;
}

const LOCK_LEVEL = 3;
const MAX_LEVEL = 10;

type HistRow = { year: number; month: number; rank: number | null };

// Sengaja diduplikasi (bukan di-import) dari quality-rank/leaderboard-kerja —
// mengikuti pola yang sudah ada di 2 file itu.
function computeBadgeLevel(rows: HistRow[]) {
    let currentStreak = 0;
    let bestStreakEver = 0;
    let prevKey: number | null = null;

    for (const row of rows) {
        const key = row.year * 12 + row.month;
        const qualifies = row.rank !== null && row.rank <= 3;
        if (qualifies) {
            currentStreak = prevKey !== null && key === prevKey + 1 ? currentStreak + 1 : 1;
            bestStreakEver = Math.max(bestStreakEver, currentStreak);
        } else {
            currentStreak = 0;
        }
        prevKey = key;
    }

    const permanentFloor = bestStreakEver >= LOCK_LEVEL ? LOCK_LEVEL : 0;
    const displayLevel = Math.min(Math.max(currentStreak, permanentFloor), MAX_LEVEL);
    const isPermanent = permanentFloor >= LOCK_LEVEL;
    const isTemporary = displayLevel > 0 && !isPermanent;

    return { currentStreak, bestStreakEver, displayLevel, isPermanent, isTemporary };
}

// GET ?userId=X                 -> level + rank + isOngoingMonth (badge di Profil)
// GET ?year=Y&month=M&list=true -> leaderboard lengkap + level tiap orang (halaman Lencana)
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    const { searchParams } = new URL(req.url);
    const now = getWIBNow();
    const nowYear = now.getUTCFullYear();
    const nowMonth = now.getUTCMonth() + 1;
    const year = parseInt(searchParams.get("year") || String(nowYear), 10);
    const month = parseInt(searchParams.get("month") || String(nowMonth), 10);

    if (searchParams.get("list") === "true") {
        const { data: rows, error } = await supabase
            .from("overtime_quality_scores")
            .select("user_id, total_points, total_overtime_minutes, rank")
            .eq("year", year)
            .eq("month", month)
            .order("rank", { ascending: true });

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        const userIds = (rows ?? []).map((r) => r.user_id);
        const safeIds = userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"];

        const { data: usersData } = await supabase
            .from("users")
            .select("id, name, role")
            .in("id", safeIds);
        const userMap = new Map((usersData ?? []).map((u) => [u.id, u]));

        const { data: historyRows } = await supabase
            .from("overtime_quality_scores")
            .select("user_id, year, month, rank")
            .in("user_id", safeIds)
            .order("year", { ascending: true })
            .order("month", { ascending: true });

        const historyByUser = new Map<string, HistRow[]>();
        (historyRows ?? []).forEach((r) => {
            if (!historyByUser.has(r.user_id)) historyByUser.set(r.user_id, []);
            historyByUser.get(r.user_id)!.push({ year: r.year, month: r.month, rank: r.rank });
        });

        const list = (rows ?? []).map((r) => {
            const levelInfo = computeBadgeLevel(historyByUser.get(r.user_id) ?? []);
            return {
                ...r,
                name: userMap.get(r.user_id)?.name ?? "Unknown",
                role: userMap.get(r.user_id)?.role ?? "",
                level: levelInfo.displayLevel,
                isPermanent: levelInfo.isPermanent,
                isTemporary: levelInfo.isTemporary,
                streakMonths: levelInfo.currentStreak,
            };
        });

        return NextResponse.json({
            success: true,
            data: list,
            isOngoingMonth: year === nowYear && month === nowMonth,
        });
    }

    const targetUserId = searchParams.get("userId") || user.id;

    const { data: historyRows, error: histErr } = await supabase
        .from("overtime_quality_scores")
        .select("year, month, rank, total_points, total_overtime_minutes")
        .eq("user_id", targetUserId)
        .order("year", { ascending: true })
        .order("month", { ascending: true });

    if (histErr) {
        return NextResponse.json({ success: false, message: histErr.message }, { status: 500 });
    }

    if (!historyRows || historyRows.length === 0) {
        return NextResponse.json({ success: true, data: null });
    }

    const levelInfo = computeBadgeLevel(historyRows.map((r) => ({ year: r.year, month: r.month, rank: r.rank })));
    const currentMonthRow = historyRows.find((r) => r.year === year && r.month === month) ?? null;
    const latestRow = historyRows[historyRows.length - 1];
    const isOngoingMonth = latestRow.year === nowYear && latestRow.month === nowMonth;

    const { count: totalRanked } = await supabase
        .from("overtime_quality_scores")
        .select("id", { count: "exact", head: true })
        .eq("year", year)
        .eq("month", month);

    return NextResponse.json({
        success: true,
        data: {
            rankThisMonth: currentMonthRow?.rank ?? null,
            totalRanked: totalRanked ?? 0,
            totalPoints: currentMonthRow?.total_points ?? null,
            totalOvertimeMinutes: currentMonthRow?.total_overtime_minutes ?? null,
            level: levelInfo.displayLevel,
            isPermanent: levelInfo.isPermanent,
            isTemporary: levelInfo.isTemporary,
            streakMonths: levelInfo.currentStreak,
            bestStreakEver: levelInfo.bestStreakEver,
            isOngoingMonth,
        },
    });
}

// POST { year, month } — hitung poin lembur LANGSUNG dari tabel `overtime`
// di server (tidak butuh data dari client seperti quality-rank), lalu upsert
// snapshot bulanan ke `overtime_quality_scores`.
async function postHandler(req: NextRequest, _ctx: any, _user: AuthUser) {
    const body = await req.json();
    const year: number = body.year;
    const month: number = body.month;

    if (!year || !month) {
        return NextResponse.json({ success: false, message: "Data tidak lengkap" }, { status: 400 });
    }

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    // Hanya lemburan yang sudah AUDITED yang dihitung poinnya — sama seperti
    // nominal gaji lembur yang baru final setelah audit_status = "AUDITED".
    const { data: rows, error } = await supabase
        .from("overtime_requests")
        .select("user_id, request_date, duration_minutes")
        .eq("audit_status", "AUDITED")
        .gte("request_date", startDate)
        .lte("request_date", endDate);

    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    // Jumlahkan dulu per user PER HARI (bisa ada beberapa sesi lembur di hari
    // yang sama), baru terapkan aturan blok 2 jam untuk hari itu.
    const minutesByUserDay = new Map<string, number>();
    (rows ?? []).forEach((r) => {
        const key = `${r.user_id}|${r.request_date}`;
        minutesByUserDay.set(key, (minutesByUserDay.get(key) ?? 0) + (r.duration_minutes ?? 0));
    });

    const totalsByUser = new Map<string, { points: number; minutes: number }>();
    minutesByUserDay.forEach((minutesThatDay, key) => {
        const userId = key.split("|")[0];
        const cur = totalsByUser.get(userId) ?? { points: 0, minutes: 0 };
        cur.points += computeDailyOvertimePoints(minutesThatDay);
        cur.minutes += minutesThatDay;
        totalsByUser.set(userId, cur);
    });

    const ranked = Array.from(totalsByUser.entries())
        .map(([user_id, v]) => ({ user_id, ...v }))
        .filter((u) => u.points > 0)
        .sort((a, b) => b.points - a.points);

    const upsertRows = ranked.map((u, i) => ({
        user_id: u.user_id,
        year,
        month,
        total_points: u.points,
        total_overtime_minutes: u.minutes,
        rank: i + 1,
        computed_at: new Date().toISOString(),
    }));

    if (upsertRows.length > 0) {
        const { error: upsertErr } = await supabase
            .from("overtime_quality_scores")
            .upsert(upsertRows, { onConflict: "user_id,year,month" });

        if (upsertErr) {
            return NextResponse.json({ success: false, message: upsertErr.message }, { status: 500 });
        }
    }

    return NextResponse.json({ success: true, data: { totalRanked: upsertRows.length } });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);