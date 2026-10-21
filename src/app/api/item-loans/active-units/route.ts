import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { ITEM_LOAN_VIEW_ROLES } from "@/lib/permissions";

// GET /api/item-loans/active-units
// Kembalikan daftar unit_id yang status pinjamannya APPROVED (sedang dipinjam).
// Dipakai Data Barang & Kelola Unit untuk menandai unit "Di Pinjam" — penanda
// saja, TIDAK memblokir penjualan (seperti SO/Audit).
async function handler(_req: NextRequest, _ctx: unknown, _user: AuthUser) {
  try {
    const { data, error } = await supabaseAdmin
      .from("item_loans")
      .select("unit_id")
      .eq("status", "APPROVED")
      .not("unit_id", "is", null);

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });

    const unitIds = (data ?? []).map((r: { unit_id: string }) => r.unit_id);
    return NextResponse.json({ success: true, data: unitIds });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, ITEM_LOAN_VIEW_ROLES);