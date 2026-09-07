import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PROVIDER_PERFORMANCE_VIEW_ROLES, PROVIDER_PERFORMANCE_ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

interface ProviderUserRow {
  id: string;
  name: string;
  role: string;
}

// ✅ Lencana Penyedia Barang — mirip pola Lencana Pengantaran (murni MILESTONE,
// bukan level/streak bulanan seperti Absensi/Pekerjaan), tapi beda 3 hal:
// (1) satuannya TOTAL UNIT LAPTOP yang berhasil disiapkan (preparation_items
//     yang tidak dibatalkan), bukan jumlah order/pengantaran;
// (2) KUMULATIF SEPANJANG WAKTU (all-time) — ASUMSI: begitu tercapai,
//     milestone-nya permanen, tidak direset/rolling per-bulan;
// (3) TIDAK dibatasi Top 3 seperti Pengantaran — siapa pun yang mencapai
//     milestone-nya tampil (sama seperti LevelBadge di Absensi/Pekerjaan).
// Kalau salah satu asumsi ini keliru, gampang diubah — logikanya diisolasi
// di helper `highestMilestone()` dan query di bawah.
const MILESTONES = [100, 300, 500, 700, 1000, 1500, 2000, 3000];

function highestMilestone(total: number): number {
  let tier = 0;
  for (const m of MILESTONES) {
    if (total >= m) tier = m;
  }
  return tier;
}

const PAGE_SIZE = 1000; // batas bawaan Supabase per query — dipaginasi
const ID_CHUNK = 150;   // batas aman .in() biar header URL tidak overflow

async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);

    // 1) Semua akun dengan role Penyedia Barang (reuse role list yang sudah
    //    dipakai di api/preparation/provider-performance)
    const { data: providerUsers, error: userErr } = await supabase
      .from("users")
      .select("id, name, role")
      .in("role", PROVIDER_PERFORMANCE_ROLES);
    if (userErr) throw userErr;

    const providers = (providerUsers ?? []) as ProviderUserRow[];

    // 2) Semua preparation_orders yang sudah SELESAI dicek (done_by terisi) —
    //    tanpa filter tanggal karena ini kumulatif all-time. Dipaginasi karena
    //    Supabase membatasi 1000 baris per query.
    const orderToProvider = new Map<string, string>();
    {
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("preparation_orders")
          .select("id, done_by")
          .not("done_by", "is", null)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        data.forEach((o: any) => orderToProvider.set(o.id, o.done_by));
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }

    const orderIds = Array.from(orderToProvider.keys());

    // 3) Hitung unit (preparation_items yang TIDAK dibatalkan) per order,
    //    lalu jumlahkan ke provider yang menyelesaikan order tsb. Query .in()
    //    di-chunk per 150 id biar header URL tidak overflow untuk data besar.
    const totalByProvider = new Map<string, number>();
    for (let i = 0; i < orderIds.length; i += ID_CHUNK) {
      const chunk = orderIds.slice(i, i + ID_CHUNK);
      const { data, error } = await supabase
        .from("preparation_items")
        .select("preparation_id")
        .in("preparation_id", chunk)
        .eq("is_cancelled", false);
      if (error) throw error;
      (data ?? []).forEach((r: any) => {
        const providerId = orderToProvider.get(r.preparation_id);
        if (!providerId) return;
        totalByProvider.set(providerId, (totalByProvider.get(providerId) ?? 0) + 1);
      });
    }

    // 4) Susun & ranking — SEMUA provider dimunculkan walau total = 0, biar
    //    konsisten dengan pola Absensi/Pekerjaan (bukan cuma yang punya data)
    const ranked = providers
      .map((p) => {
        const total = totalByProvider.get(p.id) ?? 0;
        return { user_id: p.id, name: p.name, role: p.role, total, milestone: highestMilestone(total) };
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
    console.error("[GET /api/preparation/provider-milestones]", err);
    return NextResponse.json(
      { success: false, message: err?.message ?? "Gagal mengambil data lencana penyedia barang" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler, PROVIDER_PERFORMANCE_VIEW_ROLES);