// src/app/api/akutansi/blueprint/[id]/route.ts
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

// ── DELETE — nonaktifkan misi custom + hapus status selesainya ──────────────
// Catatan: ambil param id dengan pola yang sama seperti accounts/[code]/route.ts.
// `await ctx.params` aman untuk Next 14 (objek) maupun Next 15 (Promise).
export const DELETE = withAuth(async (_req, ctx: any) => {
  const { id } = await ctx.params;
  if (!id)
    return NextResponse.json({ success: false, message: "ID misi tidak ditemukan" }, { status: 400 });

  const supabase = getAdmin();

  // Soft-delete: misi bawaan tidak pernah lewat sini (hanya custom punya id uuid).
  const { error } = await supabase
    .from("accounting_blueprint_tasks")
    .update({ is_active: false })
    .eq("id", id);

  if (error) {
    console.error("[blueprint DELETE]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  // Bersihkan status selesai misi ini (semua minggu).
  await supabase.from("accounting_blueprint_completions").delete().eq("task_key", id);

  return NextResponse.json({ success: true });
}, AKUNTANSI_ROLES);