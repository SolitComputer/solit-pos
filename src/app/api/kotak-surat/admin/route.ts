import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canAdminKotakSurat } from "@/lib/kotakSurat";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function getRoles(req: NextRequest): string[] {
  return (req.headers.get("x-user-roles") ?? "").split(",").filter(Boolean);
}

// GET: SEMUA masukan, ANONIM (tanpa user_id / nama). Admin only.
export async function GET(req: NextRequest) {
  if (!canAdminKotakSurat(getRoles(req))) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabase();
  // ⚠️ SENGAJA tidak select user_id — anonimitas di-enforce di sini.
  const { data, error } = await supabase
    .from("kotak_surat")
    .select("id, message, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: data ?? [] });
}

// DELETE: hapus satu masukan (spam, dll). Admin only. id via ?id=...
export async function DELETE(req: NextRequest) {
  if (!canAdminKotakSurat(getRoles(req))) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, message: "id wajib" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("kotak_surat").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}