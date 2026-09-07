import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

export const dynamic = "force-dynamic";

// ✅ Lencana Sales — pola sama persis dengan Lencana Penyedia Barang:
// MILESTONE kumulatif ALL-TIME (bukan level/streak bulanan), TIDAK
// dibatasi Top 3. Satuan yang dihitung: total TRANSAKSI berstatus PAID
// (lunas) yang dibuat sales tsb (kolom `sales_id` di tabel `transactions`)
// — transaksi yang masih pending (RESERVED/HELD/PACKING) atau batal
// (CANCELLED/FAILED) TIDAK dihitung, sama seperti item yang di-cancel
// tidak dihitung di Lencana Penyedia Barang.
//
// ASUMSI: sengaja TIDAK pre-fetch daftar user ber-role "Sales" (beda dari
// provider-milestones) — cukup agregasi langsung dari transactions.sales_id,
// karena sales_name & employee_role sudah ter-denormalisasi di tabel itu
// sendiri. Ini juga berarti sales dengan 0 transaksi PAID tidak ikut
// muncul di leaderboard (sama seperti pola Lencana Pengantaran).
const MILESTONES = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 20000];

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

    // Ambil semua transaksi PAID, dipaginasi karena Supabase membatasi
    // 1000 baris per query dan angka milestone di sini bisa sangat besar
    // (sampai 20.000 transaksi).
    const bySales = new Map<string, { name: string; role: string; total: number }>();
    {
      let from = 0;
      while (true) {
        const { data, error } = await supabaseAdmin
          .from("transactions")
          .select("sales_id, sales_name, employee_role")
          .eq("status", "PAID")
          .not("sales_id", "is", null)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        data.forEach((t: any) => {
          const cur = bySales.get(t.sales_id) ?? { name: t.sales_name ?? "Unknown", role: t.employee_role ?? "", total: 0 };
          cur.total += 1;
          if (t.sales_name) cur.name = t.sales_name;
          if (t.employee_role) cur.role = t.employee_role;
          bySales.set(t.sales_id, cur);
        });
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }

    const ranked = Array.from(bySales.entries())
      .map(([sales_id, v]) => ({ user_id: sales_id, name: v.name, role: v.role, total: v.total, milestone: highestMilestone(v.total) }))
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
    console.error("[GET /api/transaction/sales-milestones]", err);
    return NextResponse.json(
      { success: false, message: err?.message ?? "Gagal mengambil data lencana sales" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler);