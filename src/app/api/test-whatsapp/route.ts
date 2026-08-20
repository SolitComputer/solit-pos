import { NextRequest, NextResponse } from "next/server";
import { sendWhatsapp } from "@/service/whatsapp";
import { withAuth } from "@/lib/auth";

// ✅ SECURITY FIX: endpoint test ini dulu tidak lewat middleware (tidak ada di
// config.matcher) & tanpa cek role, jadi siapa pun yang login (bahkan tanpa
// login) bisa kirim WhatsApp ke nomor sembarang pakai akun perusahaan.
// Dikunci ke ADMIN/PROGRAMMER saja karena ini murni alat test.
export const POST = withAuth(async (req: NextRequest) => {
  try {
    const { target, message } = await req.json();

    if (!target || !message) {
      return NextResponse.json({ success: false, message: "Target dan message wajib diisi" }, { status: 400 });
    }

    const sent = await sendWhatsapp(target, message);

    return NextResponse.json({
      success: sent,
      message: sent ? "Pesan WhatsApp terkirim" : "Gagal mengirim pesan",
      target
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
  }
}, ["ADMIN", "PROGRAMMER"]);