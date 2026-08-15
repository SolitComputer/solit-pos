import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { LEADS_CHAT_MANAGE_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { deleteDevice } from "@/lib/fonnte";

// ⚠️ Lihat catatan OTP di lib/fonnte.ts deleteDevice(). Kalau delete di Fonnte
// gagal, akun tetap dihapus dari Solit POS (biar gak nyangkut di UI) tapi
// device fisiknya mungkin masih aktif di Fonnte — cek manual dashboard mereka.
async function deleteHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { id } = ctx.params;
  const { data: account, error: selectError } = await supabaseAdmin
    .from("whatsapp_accounts").select("fonnte_device_token").eq("id", id).maybeSingle();

  if (selectError) {
    console.error("[leads-chat/accounts DELETE] gagal query akun:", selectError);
    return NextResponse.json({ success: false, message: selectError.message }, { status: 500 });
  }
  if (!account) {
    console.warn(`[leads-chat/accounts DELETE] akun id=${id} sudah tidak ada di database`);
    return NextResponse.json({ success: false, message: "Akun tidak ditemukan" }, { status: 404 });
  }

  try {
    await deleteDevice({ deviceToken: account.fonnte_device_token });
  } catch (err) {
    console.warn("[leads-chat/accounts DELETE] gagal hapus device di Fonnte:", err);
  }

  const { error } = await supabaseAdmin.from("whatsapp_accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export const DELETE = withAuth(deleteHandler, LEADS_CHAT_MANAGE_ROLES);