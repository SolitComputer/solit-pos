import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

export const dynamic = "force-dynamic";

function getWIBNow() {
    return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

// ✅ Lencana Pengantaran — BEDA dari Lencana Absensi & Pekerjaan: TIDAK pakai
// sistem Level/streak bulanan. Ini murni TOTAL pengantaran berhasil dalam
// periode rolling N bulan terakhir, dan lencana yang didapat adalah MILESTONE
// tertinggi yang sudah dicapai — dan cuma Top 3 (paling banyak mengantar) di
// periode itu yang lencananya tampil. Karena tidak ada histori/streak, tidak
// perlu tabel snapshot — dihitung langsung dari preparation_orders tiap request.
const MILESTONES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

function highestMilestone(total: number): number {
    let tier = 0;
    for (const m of MILESTONES) {
        if (total >= m) tier = m;
    }
    return tier;
}

// GET ?months=N&list=true -> leaderboard lengkap periode N bulan terakhir (untuk halaman Lencana)
// GET ?months=N&userId=X  -> total + rank + milestone user tsb di periode yang sama (untuk badge di Profil)
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    const { searchParams } = new URL(req.url);
    const months = Math.min(24, Math.max(1, parseInt(searchParams.get("months") || "1", 10)));

    const endDate = getWIBNow();
    const startDate = new Date(endDate);
    startDate.setUTCMonth(startDate.getUTCMonth() - months);

    const { data: deliveries, error } = await supabaseAdmin
        .from("preparation_orders")
        .select("delivery_user_id")
        .eq("delivery_method", "PENGANTARAN")
        .eq("status", "SELESAI")
        .not("delivery_user_id", "is", null)
        .gte("delivered_at", startDate.toISOString())
        .lte("delivered_at", endDate.toISOString());

    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const countByUser = new Map<string, number>();
    (deliveries ?? []).forEach((d: any) => {
        countByUser.set(d.delivery_user_id, (countByUser.get(d.delivery_user_id) ?? 0) + 1);
    });

    const userIds = Array.from(countByUser.keys());
    const safeIds = userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"];
    const { data: usersData } = await supabaseAdmin
        .from("users")
        .select("id, name, role")
        .in("id", safeIds);
    const userMap = new Map((usersData ?? []).map((u) => [u.id, u]));

    const ranked = Array.from(countByUser.entries())
        .map(([uid, total]) => ({
            user_id: uid,
            name: userMap.get(uid)?.name ?? "Unknown",
            role: userMap.get(uid)?.role ?? "",
            total,
            milestone: highestMilestone(total),
        }))
        .sort((a, b) => b.total - a.total)
        .map((row, i) => ({ ...row, rank: i + 1 }));

    if (searchParams.get("list") === "true") {
        return NextResponse.json({ success: true, data: ranked, months });
    }

    const targetUserId = searchParams.get("userId") || user.id;
    const mine = ranked.find((r) => r.user_id === targetUserId) ?? null;

    return NextResponse.json({
        success: true,
        data: mine
            ? {
                total: mine.total,
                rank: mine.rank,
                totalRanked: ranked.length,
                milestone: mine.milestone,
                // Cuma Top 3 yang lencananya tampil, meski milestone-nya sudah tercapai
                hasBadge: mine.milestone > 0 && mine.rank <= 3,
            }
            : null,
        months,
    });
}

export const GET = withAuth(getHandler);