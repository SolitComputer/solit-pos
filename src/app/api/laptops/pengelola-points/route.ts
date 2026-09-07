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

// Sama pola pergantian tanggal WIB dengan isSoActive di LaptopsContent.tsx —
// dipakai untuk dedupe poin SO per laptop per hari (lihat POINTS_PER_SO).
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
function toWibDateStr(d: Date): string {
    return new Date(d.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

// ✅ Aturan poin Pengelola Barang:
// - Tambah unit baru (activity_logs: entity="unit", action="CREATE") = 1 poin/unit
// - Solved — unit pindah dari minus ke Siap Jual (entity="unit", action="MINUS_FIXED") = 5 poin
// - SO (entity="laptop", action="SO") = 0,3 poin — DIBATASI 1x per laptop per hari WIB,
//   supaya toggle SO/UNSO/SO berulang di hari yang sama tidak bisa dipakai numpuk poin.
const POINTS_PER_UNIT_ADDED = 1;
const POINTS_PER_SOLVED = 5;
const POINTS_PER_SO = 0.3;

const LOCK_LEVEL = 3;
const MAX_LEVEL = 10;

type HistRow = { year: number; month: number; rank: number | null };

// Sengaja diduplikasi (bukan di-import) dari quality-rank/overtime-points —
// mengikuti pola yang sudah ada di file-file itu.
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
            .from("pengelola_barang_scores")
            .select("user_id, total_points, units_added, units_solved, so_count, rank")
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
            .from("pengelola_barang_scores")
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
                total_points: Number(r.total_points),
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
        .from("pengelola_barang_scores")
        .select("year, month, rank, total_points, units_added, units_solved, so_count")
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
        .from("pengelola_barang_scores")
        .select("id", { count: "exact", head: true })
        .eq("year", year)
        .eq("month", month);

    return NextResponse.json({
        success: true,
        data: {
            rankThisMonth: currentMonthRow?.rank ?? null,
            totalRanked: totalRanked ?? 0,
            totalPoints: currentMonthRow ? Number(currentMonthRow.total_points) : null,
            unitsAdded: currentMonthRow?.units_added ?? null,
            unitsSolved: currentMonthRow?.units_solved ?? null,
            soCount: currentMonthRow?.so_count ?? null,
            level: levelInfo.displayLevel,
            isPermanent: levelInfo.isPermanent,
            isTemporary: levelInfo.isTemporary,
            streakMonths: levelInfo.currentStreak,
            bestStreakEver: levelInfo.bestStreakEver,
            isOngoingMonth,
        },
    });
}

// POST { year, month } — hitung poin LANGSUNG dari activity_logs (server-side),
// lalu upsert snapshot bulanan ke pengelola_barang_scores.
async function postHandler(req: NextRequest, _ctx: any, _user: AuthUser) {
    const body = await req.json();
    const year: number = body.year;
    const month: number = body.month;

    if (!year || !month) {
        return NextResponse.json({ success: false, message: "Data tidak lengkap" }, { status: 400 });
    }

    const lastDay = new Date(year, month, 0).getDate();
    const startDate = `${year}-${String(month).padStart(2, "0")}-01T00:00:00+07:00`;
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59+07:00`;

    // ⚠️ ASUMSI: kolom timestamp di activity_logs bernama `created_at`.
    const [{ data: createLogs, error: createErr }, { data: solvedLogs, error: solvedErr }, { data: soLogs, error: soErr }] = await Promise.all([
        supabase.from("activity_logs").select("user_id, created_at")
            .eq("entity", "unit").eq("action", "CREATE")
            .gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("activity_logs").select("user_id, created_at")
            .eq("entity", "unit").eq("action", "MINUS_FIXED")
            .gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("activity_logs").select("user_id, entity_id, created_at")
            .eq("entity", "laptop").eq("action", "SO")
            .gte("created_at", startDate).lte("created_at", endDate),
    ]);

    const firstError = createErr || solvedErr || soErr;
    if (firstError) {
        return NextResponse.json({ success: false, message: firstError.message }, { status: 500 });
    }

    const totals = new Map<string, { added: number; solved: number; so: number }>();
    const getCur = (userId: string) => totals.get(userId) ?? { added: 0, solved: 0, so: 0 };

    (createLogs ?? []).forEach((r) => {
        const cur = getCur(r.user_id);
        cur.added += 1;
        totals.set(r.user_id, cur);
    });

    (solvedLogs ?? []).forEach((r) => {
        const cur = getCur(r.user_id);
        cur.solved += 1;
        totals.set(r.user_id, cur);
    });

    // Dedupe SO: cuma dihitung 1x per (user, laptop, tanggal WIB) — mencegah
    // toggle SO/UNSO/SO berulang di hari & laptop yang sama numpuk poin.
    const seenSo = new Set<string>();
    (soLogs ?? []).forEach((r) => {
        const wibDate = toWibDateStr(new Date(r.created_at));
        const dedupeKey = `${r.user_id}|${r.entity_id}|${wibDate}`;
        if (seenSo.has(dedupeKey)) return;
        seenSo.add(dedupeKey);
        const cur = getCur(r.user_id);
        cur.so += 1;
        totals.set(r.user_id, cur);
    });

    const ranked = Array.from(totals.entries())
        .map(([user_id, v]) => ({
            user_id,
            units_added: v.added,
            units_solved: v.solved,
            so_count: v.so,
            total_points: Math.round((v.added * POINTS_PER_UNIT_ADDED + v.solved * POINTS_PER_SOLVED + v.so * POINTS_PER_SO) * 100) / 100,
        }))
        .filter((u) => u.total_points > 0)
        .sort((a, b) => b.total_points - a.total_points);

    const upsertRows = ranked.map((u, i) => ({
        ...u,
        year,
        month,
        rank: i + 1,
        computed_at: new Date().toISOString(),
    }));

    if (upsertRows.length > 0) {
        const { error: upsertErr } = await supabase
            .from("pengelola_barang_scores")
            .upsert(upsertRows, { onConflict: "user_id,year,month" });

        if (upsertErr) {
            return NextResponse.json({ success: false, message: upsertErr.message }, { status: 500 });
        }
    }

    return NextResponse.json({ success: true, data: { totalRanked: upsertRows.length } });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);