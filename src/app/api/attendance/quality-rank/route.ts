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

type QualityInput = {
    user_id: string;
    perfect_days: number;
    manual_days: number;
    late_days: number;
    absent_days: number;
    total_workdays: number;
    avg_early_minutes: number; // ✅ NEW — rata-rata menit lebih cepat dari batas telat jadwal masing-masing
};

const LOCK_LEVEL = 3;
const MAX_LEVEL = 10;

type HistRow = { year: number; month: number; rank: number | null };

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

// GET ?userId=X                 -> level + rank + isOngoingMonth (untuk badge di Profil)
// GET ?year=Y&month=M&list=true -> leaderboard lengkap + level tiap orang (untuk halaman Lencana)
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    const { searchParams } = new URL(req.url);
    const now = getWIBNow();
    const nowYear = now.getUTCFullYear();
    const nowMonth = now.getUTCMonth() + 1;
    const year = parseInt(searchParams.get("year") || String(nowYear), 10);
    const month = parseInt(searchParams.get("month") || String(nowMonth), 10);

    if (searchParams.get("list") === "true") {
        const { data: rows, error } = await supabase
            .from("attendance_quality_scores")
            .select("user_id, perfect_days, manual_days, late_days, absent_days, total_workdays, quality_pct, avg_early_minutes, rank")
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
            .from("attendance_quality_scores")
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
            isOngoingMonth: year === nowYear && month === nowMonth, // ✅ NEW — bulan yang lagi dilihat masih berjalan
        });
    }

    const targetUserId = searchParams.get("userId") || user.id;

    const { data: historyRows, error: histErr } = await supabase
        .from("attendance_quality_scores")
        .select("year, month, rank, perfect_days, manual_days, late_days, absent_days, total_workdays, quality_pct, avg_early_minutes")
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
    // ✅ NEW — kalau bulan terakhir yang dihitung untuk user ini adalah bulan
    // yang SEDANG berjalan (sama dengan hari ini), kontribusi level terakhir
    // masih bisa berubah sampai akhir bulan — badge ditandai "Sementara".
    const isOngoingMonth = latestRow.year === nowYear && latestRow.month === nowMonth;

    const { count: totalRanked } = await supabase
        .from("attendance_quality_scores")
        .select("id", { count: "exact", head: true })
        .eq("year", year)
        .eq("month", month);

    return NextResponse.json({
        success: true,
        data: {
            rankThisMonth: currentMonthRow?.rank ?? null,
            totalRanked: totalRanked ?? 0,
            perfectDays: currentMonthRow?.perfect_days ?? null,
            violations: currentMonthRow ? currentMonthRow.manual_days + currentMonthRow.late_days + currentMonthRow.absent_days : null,
            qualityPct: currentMonthRow ? Number(currentMonthRow.quality_pct) : null,
            avgEarlyMinutes: currentMonthRow ? Number(currentMonthRow.avg_early_minutes) : null,
            level: levelInfo.displayLevel,
            isPermanent: levelInfo.isPermanent,
            isTemporary: levelInfo.isTemporary,
            streakMonths: levelInfo.currentStreak,
            bestStreakEver: levelInfo.bestStreakEver,
            isOngoingMonth,
        },
    });
}

// POST — hitung ranking dari data yang dikirim client, lalu upsert ke tabel.
async function postHandler(req: NextRequest, _ctx: any, _user: AuthUser) {
    const body = await req.json();
    const year: number = body.year;
    const month: number = body.month;
    const scores: QualityInput[] = Array.isArray(body.scores) ? body.scores : [];

    if (!year || !month || scores.length === 0) {
        return NextResponse.json({ success: false, message: "Data tidak lengkap" }, { status: 400 });
    }

    // ✅ NEW — urutan ranking: (1) paling sedikit pelanggaran, (2) paling banyak
    // hari sempurna, (3) persentase tertinggi, (4) rata-rata menit lebih cepat
    // dari jadwal — tiebreak terakhir ini yang menjelaskan "kenapa dia posisi
    // nomor 1" kalau 3 kriteria di atas sama persis.
    const ranked = [...scores].sort((a, b) => {
        const va = a.manual_days + a.late_days + a.absent_days;
        const vb = b.manual_days + b.late_days + b.absent_days;
        if (va !== vb) return va - vb;
        if (b.perfect_days !== a.perfect_days) return b.perfect_days - a.perfect_days;
        const pctA = a.total_workdays > 0 ? a.perfect_days / a.total_workdays : 0;
        const pctB = b.total_workdays > 0 ? b.perfect_days / b.total_workdays : 0;
        if (pctB !== pctA) return pctB - pctA;
        // ✅ avg_early_minutes sekarang berarti "rata-rata JARAK MUTLAK (menit) ke
        // jam buka jadwal efektifnya sendiri" — selalu >= 0, makin KECIL/dekat ke
        // 0 makin bagus, diurutkan ASCENDING.
        return (a.avg_early_minutes || 0) - (b.avg_early_minutes || 0);
    });
    const rows = ranked.map((s) => {
        const pctRaw = s.total_workdays > 0 ? (s.perfect_days / s.total_workdays) * 100 : 0;
        return {
            user_id: s.user_id,
            year,
            month,
            perfect_days: s.perfect_days,
            manual_days: s.manual_days,
            late_days: s.late_days,
            absent_days: s.absent_days,
            total_workdays: s.total_workdays,
            // ✅ NEW — presisi dinaikkan jadi 4 desimal (sebelumnya 2)
            quality_pct: Math.round(pctRaw * 10000) / 10000,
            // ✅ FIXED — presisi dinaikkan ke 4 desimal (sebelumnya 2)
            avg_early_minutes: Math.round((s.avg_early_minutes || 0) * 10000) / 10000,
            rank: 0, // diisi di bawah
            computed_at: new Date().toISOString(),
        };
    });

    rows.forEach((cur, i) => {
        cur.rank = i + 1;
    });

    const { error } = await supabase
        .from("attendance_quality_scores")
        .upsert(rows, { onConflict: "user_id,year,month" });

    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);