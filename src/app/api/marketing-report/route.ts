import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { fetchAllRows } from "@/lib/supabase-paginate";
import { hasAnyRole, SALES_REPORT_AUDIT_ROLES } from "@/lib/permissions";
import {
  aggregateMarketingReport,
  resolveDateRangeUtc,
  type AuditedReportLite,
} from "@/lib/marketing-report";

export const dynamic = "force-dynamic";

// Sumber data = tabel Laporan Harian Sales. Route ini READ-ONLY — tidak
// menulis apa pun, jadi fungsi Laporan Harian Sales tidak terpengaruh.
const TABLE = "sales_online_reports";

// Yang boleh lihat Laporan Marketing = role yang boleh audit laporan sales
// (ADMIN, PROGRAMMER, ASISTEN_CEO, KEPALA_MARKETING, MARKETING, PKL_MARKETING)
// — sama persis dengan role yang dapat menu grup "Marketing" di sidebar.
const VIEW_ROLES = SALES_REPORT_AUDIT_ROLES;

function getUserRoles(user: AuthUser): string[] {
  const anyUser = user as any;
  return Array.isArray(anyUser?.roles) && anyUser.roles.length > 0
    ? anyUser.roles
    : [anyUser?.role].filter(Boolean);
}

// GET /api/marketing-report?from=YYYY-MM-DD&to=YYYY-MM-DD
// from & to opsional (kontrak sama dgn kalender InlineDateRange di Cashflow):
// keduanya kosong = semua waktu, salah satu kosong = sisi itu tidak dibatasi.
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    if (!hasAnyRole(getUserRoles(user), VIEW_ROLES)) {
      return NextResponse.json({ success: false, message: "Tidak punya akses Laporan Marketing" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const range = resolveDateRangeUtc(searchParams.get("from"), searchParams.get("to"));
    if (!range.success) {
      return NextResponse.json({ success: false, message: range.error }, { status: 400 });
    }
    const { startUtc, endUtc } = range.value;
    // "" / "ALL" = tanpa filter toko (gabungan semua toko).
    const storeFilter = (searchParams.get("store") ?? "").trim();

    // 1) Laporan yang SUDAH diaudit → bahan rekap.
    //    Cuma ambil kolom yang dibutuhkan (hemat bandwidth).
    const { data, error } = await fetchAllRows((from, to) => {
      let q = supabaseAdmin
        .from(TABLE)
        .select("id, channel, interest")
        .is("deleted_at", null)
        .eq("audited", true);
      if (startUtc) q = q.gte("created_at", startUtc);
      if (endUtc) q = q.lt("created_at", endUtc);
      if (storeFilter && storeFilter !== "ALL") q = q.eq("nama_toko", storeFilter);
      return q
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
    });
    if (error) throw new Error(error.message);

    // 1b) Data import historis (Excel) dari `marketing_report_import` — digabung
    //     ke rekap seolah-olah laporan teraudit. Difilter rentang & toko yang SAMA.
    //     Tiap baris qty di-"mekar" jadi N baris sintetis {channel, interest}.
    //     TIDAK menyentuh sales_online_reports → poin/leaderboard/Laporan Harian
    //     Sales tidak terpengaruh. Hapus baris importnya untuk membatalkan.
    const { data: importRows, error: importError } = await fetchAllRows((from, to) => {
      let q = supabaseAdmin
        .from("marketing_report_import")
        .select("channel, interest, qty");
      if (startUtc) q = q.gte("occurred_at", startUtc);
      if (endUtc) q = q.lt("occurred_at", endUtc);
      if (storeFilter && storeFilter !== "ALL") q = q.eq("nama_toko", storeFilter);
      return q.order("occurred_at", { ascending: false }).range(from, to);
    });
    if (importError) throw new Error(importError.message);

    const expandedImport: AuditedReportLite[] = [];
    for (const r of (importRows ?? []) as Array<{ channel: string; interest: string; qty: number }>) {
      const qty = Math.max(0, Math.trunc(Number(r.qty) || 0));
      for (let i = 0; i < qty; i++) expandedImport.push({ channel: r.channel, interest: r.interest });
    }

    // 2) Jumlah laporan yang BELUM diaudit di periode yang sama — cuma info
    //    di UI ("x laporan menunggu audit"), TIDAK ikut dihitung di Qty.
    let pendingQuery = supabaseAdmin
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("audited", false);
    if (startUtc) pendingQuery = pendingQuery.gte("created_at", startUtc);
    if (endUtc) pendingQuery = pendingQuery.lt("created_at", endUtc);
    // Laporan yang BELUM diaudit belum punya nama_toko (toko dipilih saat audit),
    // jadi sengaja TIDAK difilter per toko — biar jumlah "Menunggu Audit" tetap
    // akurat walau tab toko tertentu sedang dipilih.
    const { count: pendingAuditCount, error: pendingError } = await pendingQuery;
    if (pendingError) throw new Error(pendingError.message);

    const report = aggregateMarketingReport([
      ...((data ?? []) as AuditedReportLite[]),
      ...expandedImport,
    ]);
    
    return NextResponse.json({
      success: true,
      data: { ...report, pendingAuditCount: pendingAuditCount ?? 0 },
    });
  } catch (error: any) {
    // Detail error cuma masuk log PM2, jangan bocorkan nama tabel/kolom ke client.
    console.error("Marketing report error:", error);
    return NextResponse.json({ success: false, message: "Gagal memuat Laporan Marketing." }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);