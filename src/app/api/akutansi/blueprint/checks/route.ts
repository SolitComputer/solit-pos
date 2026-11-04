// src/app/api/akutansi/blueprint/checks/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── POST — tandai / batal centang satu rincian ──────────────────────────────
// Body: { item_id: string; done: boolean; by?: string }
// Status PERSIST (tidak per minggu) — bersih hanya saat tombol Reset ditekan.
export const POST = withAuth(async (req, _ctx, user: any) => {
  const body = await req.json();
  const { item_id, done, by } = body as { item_id: string; done: boolean; by?: string };

  if (!item_id?.trim())
    return NextResponse.json({ success: false, message: "item_id wajib diisi" }, { status: 400 });

  const supabase = getAdmin();

  if (done) {
    const { error } = await supabase
      .from("accounting_blueprint_checks")
      .upsert(
        {
          item_id: item_id.trim(),
          checked_by: user.id,
          checked_by_name: by?.trim() || null,
          checked_at: new Date().toISOString(),
        },
        { onConflict: "item_id" }
      );
    if (error) {
      console.error("[blueprint checks upsert]", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from("accounting_blueprint_checks")
      .delete()
      .eq("item_id", item_id.trim());
    if (error) {
      console.error("[blueprint checks delete]", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}, AKUNTANSI_ROLES);