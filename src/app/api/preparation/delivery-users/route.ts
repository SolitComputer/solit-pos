import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_DONE_ROLES, PREPARATION_DELIVERY_PERSON_ROLES } from "@/lib/permissions";

// Daftar akun role Pengantaran untuk dipilih saat assign pengantaran
async function getHandler(_req: NextRequest, _ctx: any, _user: AuthUser) {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, role")
      .in("role", PREPARATION_DELIVERY_PERSON_ROLES)
      .order("name", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err) {
    console.error("[GET /api/preparation/delivery-users]", err);
    return NextResponse.json({ success: false, message: "Gagal mengambil daftar pengantar" }, { status: 500 });
  }
}

// Yang boleh assign = yang boleh selesaikan penyiapan (penyedia/sales/admin)
export const GET = withAuth(getHandler, PREPARATION_DONE_ROLES);