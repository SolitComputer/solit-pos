import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { SO_HISTORY_VIEW_ROLES } from "@/lib/permissions";

interface SoLogRow {
  id: string;
  action: "SO" | "UNSO";
  so_by: string;
  so_at: string;
  notes: string | null;
  laptop_id: string;
}

// Riwayat SO gabungan lintas SEMUA laptop — dipakai halaman
// /dashboard/laptops/so-history. Beda dari GET /api/laptops/[id]/so yang
// scope-nya 1 laptop saja.
//
// Query nama laptop dipecah jadi 2 langkah (bukan embed
// "laptops(laptop_name)") karena laptop_so_logs belum tentu terdaftar FK-nya
// ke tabel laptops di Supabase — kalau relasinya belum ke-set di schema,
// syntax embed akan error "could not find relationship". Query terpisah +
// merge di JS selalu aman dipakai berapa pun kondisi FK-nya.
async function getHandler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 25));
    const search = searchParams.get("search")?.trim() || "";
    const actionParam = searchParams.get("action");
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Kalau ada pencarian nama laptop, resolve dulu ke daftar laptop_id yang
    // cocok, baru dipakai filter .in() di query log-nya.
    let laptopIdFilter: string[] | null = null;
    if (search) {
      const { data: matched, error: matchErr } = await supabase
        .from("laptops")
        .select("id")
        .ilike("laptop_name", `%${search}%`);
      if (matchErr) {
        return NextResponse.json({ success: false, message: matchErr.message }, { status: 400 });
      }
      laptopIdFilter = (matched ?? []).map((l: { id: string }) => l.id);
      // Tidak ada laptop yang cocok -> hasilnya pasti kosong, tidak perlu
      // query laptop_so_logs sama sekali.
      if (laptopIdFilter.length === 0) {
        return NextResponse.json({ success: true, data: [], total: 0, page, limit });
      }
    }

    let query = supabase
      .from("laptop_so_logs")
      .select("id, action, so_by, so_at, notes, laptop_id", { count: "exact" })
      .order("so_at", { ascending: false })
      .range(from, to);

    if (laptopIdFilter) query = query.in("laptop_id", laptopIdFilter);
    if (actionParam === "SO" || actionParam === "UNSO") query = query.eq("action", actionParam);

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    const logs = (data ?? []) as SoLogRow[];

    // Ambil nama laptop HANYA untuk id yang muncul di halaman ini (bukan
    // semua laptop) supaya query kedua tetap ringan.
    const laptopIds = Array.from(new Set(logs.map((l) => l.laptop_id).filter(Boolean)));
    let namesById: Record<string, string> = {};
    if (laptopIds.length > 0) {
      const { data: laptopRows } = await supabase
        .from("laptops")
        .select("id, laptop_name")
        .in("id", laptopIds);
      namesById = Object.fromEntries(
        (laptopRows ?? []).map((l: { id: string; laptop_name: string }) => [l.id, l.laptop_name])
      );
    }

    const result = logs.map((row) => ({
      id: row.id,
      action: row.action,
      so_by: row.so_by,
      so_at: row.so_at,
      notes: row.notes,
      laptop_id: row.laptop_id,
      // Laptop-nya mungkin sudah dihapus (DELETE /api/laptops/[id] tidak
      // menghapus laptop_so_logs) — riwayat tetap tampil dengan label ini
      // supaya histori tidak hilang, sesuai tujuan awal fitur ini.
      laptop_name: namesById[row.laptop_id] ?? "(Laptop sudah dihapus)",
    }));

    return NextResponse.json({ success: true, data: result, total: count ?? 0, page, limit });
  } catch {
    return NextResponse.json({ success: false, message: "Terjadi kesalahan server" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, SO_HISTORY_VIEW_ROLES);