import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

interface Props {
  params: Promise<{ id: string }>;
}

async function postHandler(_req: NextRequest, props: Props, user: AuthUser) {
  const { id } = await props.params;

  // 1. Cek dulu apakah user ini sudah pernah menandai note ini — supaya nggak dobel row
  const { data: existing, error: checkError } = await supabaseAdmin
    .from("patch_note_reads")
    .select("id")
    .eq("patch_note_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (checkError) {
    console.error("[patch-notes/[id]/read CHECK]", checkError);
    return NextResponse.json({ success: false, message: checkError.message }, { status: 500 });
  }

  // 2. Insert HANYA kalau belum pernah ada — ini yang bikin statusnya PERSISTEN di DB
  //    (bukan localStorage/state), makanya nggak akan muncul lagi walau logout-login
  if (!existing) {
    const { error: insertError } = await supabaseAdmin.from("patch_note_reads").insert({
      patch_note_id: id,
      user_id: user.id,
      read_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("[patch-notes/[id]/read INSERT]", insertError);
      return NextResponse.json({ success: false, message: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

export const POST = withAuth(postHandler);