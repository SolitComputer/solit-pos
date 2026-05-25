import { NextRequest, NextResponse } from "next/server";
import { sendWhatsapp } from "@/service/whatsapp";

export async function POST(req: NextRequest) {
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
}