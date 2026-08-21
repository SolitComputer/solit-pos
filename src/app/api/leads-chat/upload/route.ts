import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { LEADS_CHAT_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";

const BUCKET = "leads-chat-media";

async function postHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ success: false, message: "File wajib diisi" }, { status: 400 });
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ success: false, message: "Cuma file gambar yang didukung" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ success: false, message: "Ukuran gambar maksimal 5MB" }, { status: 400 });
  }

  // ✅ FIX: ekstensi dulu diambil mentah dari file.name — kalau nama file
  // tidak punya titik, seluruh nama (yang bisa mengandung karakter aneh)
  // jadi "ekstensi". Disamakan dengan sanitasi di messages/group-chat upload.
  const rawExt = (file.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
  const ext = rawExt || "jpg";
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, { contentType: file.type });
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ success: true, url: pub.publicUrl });
}

export const POST = withAuth(postHandler, LEADS_CHAT_ROLES);