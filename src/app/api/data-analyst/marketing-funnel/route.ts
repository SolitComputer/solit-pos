import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { hasAnyRole, DATA_ANALYST_VIEW_ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function getUserRoles(user: AuthUser): string[] {
  const anyUser = user as any;
  return Array.isArray(anyUser?.roles) && anyUser.roles.length > 0
    ? anyUser.roles
    : [anyUser?.role].filter(Boolean);
}

// GET /api/data-analyst/marketing-funnel?from=YYYY-MM-DD&to=YYYY-MM-DD
// Agregator READ-ONLY lintas tabel — tidak ada write operation. Gunanya:
//   - Awareness: SUM(jangkauan) dari marketing_awareness_reports
//   - Interest:  SUM engagement dari cc_reports (like+comment+share) *placeholder*
//   - Decision:  COUNT(sales_online_reports) yang diaudit (leads terverifikasi)
//   - Action:    COUNT(transactions) dalam periode
// Interest masih placeholder 0 sampai field engagement-nya dipetakan ke tabel.
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    if (!hasAnyRole(getUserRoles(user), DATA_ANALYST_VIEW_ROLES)) {
      return NextResponse.json(
        { success: false, message: "Tidak punya akses Data Analyst" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // ─── Awareness: SUM jangkauan ─────────────────────────────────────────
    let awarenessQ = supabaseAdmin
      .from("marketing_awareness_reports")
      .select("jangkauan")
      .is("deleted_at", null);
    if (from) awarenessQ = awarenessQ.gte("tanggal", from);
    if (to) awarenessQ = awarenessQ.lte("tanggal", to);
    const { data: awarenessData, error: awErr } = await awarenessQ;
    if (awErr) throw new Error(awErr.message);
    const awareness = (awarenessData ?? []).reduce(
      (s: number, r: any) => s + Number(r.jangkauan ?? 0),
      0
    );

    // ─── Decision: COUNT leads terverifikasi (sales_online_reports audited) ──
    let decisionQ = supabaseAdmin
      .from("sales_online_reports")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("audited", true);
    if (from) decisionQ = decisionQ.gte("created_at", from + "T00:00:00Z");
    if (to) decisionQ = decisionQ.lte("created_at", to + "T23:59:59Z");
    const { count: decisionCount, error: deErr } = await decisionQ;
    if (deErr) throw new Error(deErr.message);

    // ─── Action: COUNT transaksi di periode ──────────────────────────────
    let actionQ = supabaseAdmin
      .from("transactions")
      .select("id", { count: "exact", head: true });
    if (from) actionQ = actionQ.gte("created_at", from + "T00:00:00Z");
    if (to) actionQ = actionQ.lte("created_at", to + "T23:59:59Z");
    const { count: actionCount, error: acErr } = await actionQ;
    // Kalau tabel transactions nama kolomnya beda / error, jangan fail —
    // data analyst tetap tampilkan funnel dengan interest/action = 0.
    const action = acErr ? 0 : (actionCount ?? 0);

    return NextResponse.json({
      success: true,
      data: {
        awareness,
        interest: 0, // TODO: hook ke cc_reports engagement sum
        decision: decisionCount ?? 0,
        action,
      },
    });
  } catch (error: any) {
    console.error("GET /api/data-analyst/marketing-funnel error:", error);
    return NextResponse.json(
      { success: false, message: "Gagal memuat funnel marketing" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler);    