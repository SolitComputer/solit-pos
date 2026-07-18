import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { isValidPeriod } from "@/lib/accounting";
import { buildDraftsForPeriod, draftKey, getPostedKeys } from "@/lib/accountingSource";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export const GET = withAuth(async (req) => {
  const period = new URL(req.url).searchParams.get("period") ?? "";
  if (!isValidPeriod(period))
    return NextResponse.json({ success: false, message: "Periode tidak valid" }, { status: 400 });

  const supabase = getAdmin();

  let drafts, posted;
  try {
    [drafts, posted] = await Promise.all([
      buildDraftsForPeriod(supabase, period),
      getPostedKeys(supabase),
    ]);
  } catch (e: any) {
    console.error("[akuntansi pending]", e);
    return NextResponse.json(
      { success: false, message: e?.message ?? "Gagal memuat data pending" },
      { status: 500 }
    );
  }

  const pending = drafts.filter((d) => !posted.has(draftKey(d)));

  return NextResponse.json({
    success: true,
    data: pending,
    summary: {
      total: pending.length,
      transaction: pending.filter((d) => d.source_type === "TRANSACTION").length,
      service: pending.filter((d) => d.source_type === "SERVICE").length,
      cashflow: pending.filter((d) => d.source_type === "CASHFLOW").length,
    },
  });
}, AKUNTANSI_ROLES);