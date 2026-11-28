import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { hasAnyRole, DATA_ANALYST_VIEW_ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function getUserRoles(user: AuthUser): string[] {
  const anyUser = user as any;
  return Array.isArray(anyUser?.roles) && anyUser.roles.length > 0
    ? anyUser.roles : [anyUser?.role].filter(Boolean);
}

// GET /api/data-analyst/awareness-breakdown?from=...&to=...
// Return nested: brand → platform → account → total jangkauan
// Frontend bisa tampilkan "by Toko" (group ke brand) atau "by Platform" (group ke platform).
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  if (!hasAnyRole(getUserRoles(user), DATA_ANALYST_VIEW_ROLES)) {
    return NextResponse.json({ success: false, message: "Tidak punya akses" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabaseAdmin
    .from("marketing_awareness_reports")
    .select(`
      jangkauan,
      account:account_id (
        id, name,
        platform:brand_platform_id ( id, name,
          brand:brand_id ( id, name )
        )
      )
    `)
    .is("deleted_at", null);
  if (from) query = query.gte("tanggal", from);
  if (to) query = query.lte("tanggal", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  // Agregasi di app layer — Supabase ga enak buat nested GROUP BY
  const rows = (data ?? []) as any[];
  const total = rows.reduce((s, r) => s + Number(r.jangkauan ?? 0), 0);

  // Flatten + aggregate ke beberapa shape
  const byAccount = new Map<string, { brand: string; platform: string; account: string; total: number }>();
  for (const r of rows) {
    const acc = r.account;
    if (!acc?.platform?.brand) continue;
    const key = `${acc.platform.brand.name}|${acc.platform.name}|${acc.name}`;
    const existing = byAccount.get(key) ?? {
      brand: acc.platform.brand.name,
      platform: acc.platform.name,
      account: acc.name,
      total: 0,
    };
    existing.total += Number(r.jangkauan ?? 0);
    byAccount.set(key, existing);
  }

  return NextResponse.json({
    success: true,
    data: {
      total,
      breakdown: Array.from(byAccount.values()),
    },
  });
}

export const GET = withAuth(getHandler);