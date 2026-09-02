import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

export const dynamic = "force-dynamic";

// ✅ Lencana Konten Kreator — pola sama persis dengan Lencana Penyedia
// Barang/Sales/Teknisi: MILESTONE kumulatif ALL-TIME, TIDAK dibatasi Top 3.
//
// ASUMSI (koreksi kalau salah): "take video dan edit X video" dihitung
// sebagai TOTAL PENYELESAIAN TAHAP — jumlah tahap Take yang diselesaikan
// (take_done_by = user) DITAMBAH jumlah tahap Edit yang diselesaikan
// (edit_done_by = user), BUKAN jumlah video unik. Kalau 1 orang mengerjakan
// Take DAN Edit untuk 1 video yang sama, itu dihitung 2 — ini mengikuti
// pola scoring "Leaderboard Kerja" yang sudah ada di project ini (4 poin
// Take + 4 poin Edit, dihitung terpisah). Konten yang di-Batal
// (is_cancelled) tidak dihitung, sama seperti item/order yang
// dibatalkan/gagal di fitur Lencana lain.
const MILESTONES = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

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

    const totalByUser = new Map<string, { name: string; total: number }>();

    // 1) Semua tahap Take yang sudah selesai
    {
      let from = 0;
      while (true) {
        const { data, error } = await supabaseAdmin
          .from("cc_reports")
          .select("take_done_by, take_done_by_name")
          .eq("take_done", true)
          .eq("is_cancelled", false)
          .not("take_done_by", "is", null)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        data.forEach((r: any) => {
          const cur = totalByUser.get(r.take_done_by) ?? { name: r.take_done_by_name ?? "Unknown", total: 0 };
          cur.total += 1;
          if (r.take_done_by_name) cur.name = r.take_done_by_name;
          totalByUser.set(r.take_done_by, cur);
        });
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }

    // 2) Semua tahap Edit yang sudah selesai
    {
      let from = 0;
      while (true) {
        const { data, error } = await supabaseAdmin
          .from("cc_reports")
          .select("edit_done_by, edit_done_by_name")
          .eq("edit_done", true)
          .eq("is_cancelled", false)
          .not("edit_done_by", "is", null)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        data.forEach((r: any) => {
          const cur = totalByUser.get(r.edit_done_by) ?? { name: r.edit_done_by_name ?? "Unknown", total: 0 };
          cur.total += 1;
          if (r.edit_done_by_name) cur.name = r.edit_done_by_name;
          totalByUser.set(r.edit_done_by, cur);
        });
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }

    // 3) Nama & total sudah cukup dari denormalized columns di atas, cuma
    //    "role" yang perlu di-lookup dari tabel users untuk subtitle di tabel
    const userIds = Array.from(totalByUser.keys());
    const safeIds = userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"];
    const { data: usersData } = await supabaseAdmin
      .from("users")
      .select("id, role")
      .in("id", safeIds);
    const roleMap = new Map((usersData ?? []).map((u: any) => [u.id, u.role]));

    const ranked = Array.from(totalByUser.entries())
      .map(([id, v]) => ({ user_id: id, name: v.name, role: roleMap.get(id) ?? "", total: v.total, milestone: highestMilestone(v.total) }))
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