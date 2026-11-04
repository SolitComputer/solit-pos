// src/app/api/akutansi/blueprint/items/[id]/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── DELETE — hapus satu rincian (centangnya ikut terhapus via cascade) ──────
export const DELETE = withAuth(async (_req, ctx: any) => {
  const { id } = await ctx.params;
  if (!id)
    return NextResponse.json({ success: false, message: "ID rincian tidak ditemukan" }, { status: 400 });

  const supabase = getAdmin();
  const { error } = await supabase.from("accounting_blueprint_items").delete().eq("id", id);
  if (error) {
    console.error("[blueprint items DELETE]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}, AKUNTANSI_MANAGE_ROLES);