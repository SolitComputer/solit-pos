import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MIN_QUERY_LENGTH = 2; // "HP" sudah cukup untuk memicu saran
const MAX_QUERY_LENGTH = 100;
const MAX_SUGGESTIONS = 8;
// Saran harus selalu fresh dari database — jangan sampai ada cache yang
// masih menyimpan saran lama (misalnya setelah riwayat di-reset).
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

// GET /api/sales-reports/interest-suggestions?q=pavilion
// Sumber: tabel sales_interest_history (riwayat terpisah dari laporan, diisi
// otomatis oleh trigger saat laporan disimpan) lewat RPC search_sales_interest.
// Reset riwayat = kosongkan tabel itu; data laporan tidak ikut tersentuh.
async function getHandler(req: NextRequest) {
  try {
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);
    if (q.length < MIN_QUERY_LENGTH) {
      return NextResponse.json({ success: true, data: [] }, { headers: NO_STORE_HEADERS });
    }

    const { data, error } = await supabaseAdmin.rpc("search_sales_interest", {
      p_query: q,
      p_limit: MAX_SUGGESTIONS,
    });
    if (error) throw new Error(error.message);

    const suggestions = ((data ?? []) as { interest: string | null }[])
      .map((row) => row.interest?.trim() ?? "")
      .filter((value) => value.length > 0);

    return NextResponse.json({ success: true, data: suggestions }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("Interest suggestions error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);