import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

export const dynamic = "force-dynamic";

// ✅ Lencana Konten Kreator — MILESTONE kumulatif ALL-TIME, TIDAK dibatasi Top 3.
//
// SCORING: berbasis PERAN yang ditugaskan di tiap konten. Tiap peran yang
// terisi dengan user divisi Konten bernilai 4 poin:
//   - videographer_user_id → +4
//   - talent_user_id       → +4
//   - editor_user_id       → +4
// Jadi 1 konten maksimal 12 poin (kalau ketiga peran terisi). Nama yang
// diketik manual (user_id null) TIDAK dihitung. Konten yang di-Batal
// (is_cancelled) tidak dihitung.
const MILESTONES = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
const POINTS_PER_ROLE = 4;

function highestMilestone(total: number): number {
  let tier = 0;
  for (const m of MILESTONES) {
    if (total >= m) tier = m;
  }
  return tier;
}

const PAGE_SIZE = 1000; // batas bawaan Supabase per query — dipaginasi

async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);

    const totalByUser = new Map<string, { total: number }>();

    const addPoints = (id: string | null | undefined) => {
      if (!id) return;
      const cur = totalByUser.get(id) ?? { total: 0 };
      cur.total += POINTS_PER_ROLE;
      totalByUser.set(id, cur);
    };

    // Semua konten yang TIDAK dibatalkan — tiap peran terisi = 4 poin.
    // `.not("is_cancelled", "is", true)` = IS NOT TRUE → ikut baris false DAN null.
    {
      let from = 0;
      while (true) {
        const { data, error } = await supabaseAdmin
          .from("cc_reports")
          .select("videographer_user_id, talent_user_id, editor_user_id")
          .not("is_cancelled", "is", true)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        data.forEach((r: any) => {
          addPoints(r.videographer_user_id);
          addPoints(r.talent_user_id);
          addPoints(r.editor_user_id);
        });
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }

    // Nama & role di-lookup dari tabel users (user_id bukan denormalized name).
    const userIds = Array.from(totalByUser.keys());
    const safeIds = userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"];
    const { data: usersData } = await supabaseAdmin
      .from("users")
      .select("id, name, role")
      .in("id", safeIds);
    const infoMap = new Map(
      (usersData ?? []).map((u: any) => [u.id, { name: u.name ?? "Unknown", role: u.role ?? "" }])
    );

    const ranked = Array.from(totalByUser.entries())
      .map(([id, v]) => {
        const info = infoMap.get(id);
        return {
          user_id: id,
          name: info?.name ?? "Unknown",
          role: info?.role ?? "",
          total: v.total,
          milestone: highestMilestone(v.total),
        };
      })
      .sort((a, b) => b.total - a.total)
      .map((row, i) => ({ ...row, rank: i + 1 }));

    if (searchParams.get("list") === "true") {
      return NextResponse.json({ success: true, data: ranked });
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
            hasBadge: mine.milestone > 0,
          }
        : null,
    });
  } catch (err: any) {
    console.error("[GET /api/cc-reports/konten-milestones]", err);
    return NextResponse.json(
      { success: false, message: err?.message ?? "Gagal mengambil data lencana konten kreator" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler);