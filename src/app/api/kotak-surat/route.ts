import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canSubmitKotakSurat } from "@/lib/kotakSurat";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/** Identitas tepercaya datang dari header yang di-set middleware (sudah verifikasi JWT). */
function getIdentity(req: NextRequest) {
  const userId = req.headers.get("x-user-id") ?? "";
  const roles = (req.headers.get("x-user-roles") ?? "").split(",").filter(Boolean);
  return { userId, roles };
}

// GET: masukan milik SENDIRI saja (karyawan).
export async function GET(req: NextRequest) {
  const { userId } = getIdentity(req);
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("kotak_surat")
    .select("id, message, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: data ?? [] });
}

// POST: kirim masukan baru (anonim). user_id disimpan diam-diam utk filter "punya saya".
export async function POST(req: NextRequest) {
  const { userId, roles } = getIdentity(req);
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!canSubmitKotakSurat(roles)) {
    return NextResponse.json(
      { success: false, message: "Role Anda tidak bisa mengirim masukan" },
      { status: 403 }
    );
  }

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (message.length < 1) {
    return NextResponse.json({ success: false, message: "Masukan tidak boleh kosong" }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ success: false, message: "Masukan maksimal 2000 karakter" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("kotak_surat")
    .insert({ user_id: userId, message })
    .select("id, message, created_at")
    .single();

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data });
}