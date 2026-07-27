import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabase } from "@/services/supabase";
import { LAPTOP_READY_VIEW_ROLES } from "@/lib/permissions";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { data, error } = await supabase
      .from("laptops")
      .select("*")
      .eq("status", "SIAP_JUAL")
      .gt("qty", 0)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    //  Badge "NEW" — sama pola dengan api/laptops/route.ts: dihitung di server
    //  dari created_at, dikirim sebagai boolean is_new. Berlaku 3 hari sejak
    //  laptop dibuat, read-time, tanpa perlu cron job untuk "matiin" badge-nya.
    //  CATATAN: query di atas SELECT dari tabel `laptops` (bukan `laptop_units`),
    //  jadi created_at yang dipakai di sini adalah created_at MODEL laptop,
    //  bukan created_at per-unit seperti di api/laptops/route.ts.
    const NEW_BADGE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 hari
    const now = Date.now();
    const withIsNew = (data ?? []).map((l: Record<string, any>) => ({
      ...l,
      is_new: !!l.created_at && now - new Date(l.created_at).getTime() < NEW_BADGE_TTL_MS,
    }));

    return NextResponse.json({ success: true, data: withIsNew });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, LAPTOP_READY_VIEW_ROLES);