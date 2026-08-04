// src/app/api/akutansi/laba-rugi/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { isValidPeriod } from "@/lib/accounting";
import { computeLabaRugi } from "@/lib/akutansi-reports";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Logic hitungnya ada di @/lib/akutansi-reports supaya sinkron dengan
// export Excel (lihat /api/akutansi/export).
export const GET = withAuth(async (req) => {
  const period = new URL(req.url).searchParams.get("period") ?? "";
  if (!isValidPeriod(period))
    return NextResponse.json({ success: false, message: "Periode tidak valid" }, { status: 400 });

  const supabase = getAdmin();

  try {
    const data = await computeLabaRugi(supabase, period);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("[laba-rugi GET]", error);
    return NextResponse.json(
      { success: false, message: error?.message ?? "Gagal memuat laba rugi" },
      { status: 500 }
    );
  }
}, AKUNTANSI_ROLES);
