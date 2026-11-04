// src/app/api/akutansi/blueprint/reset/route.ts
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

// ── POST — reset semua centang (manage saja) ────────────────────────────────
// Dipakai tombol Reset manual; menghapus seluruh baris di tabel checks.
export const POST = withAuth(async () => {
  const supabase = getAdmin();
  // Supabase menolak delete tanpa filter → filter yang selalu true.
  const { error } = await supabase
    .from("accounting_blueprint_checks")
    .delete()
    .neq("item_id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    console.error("[blueprint reset]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}, AKUNTANSI_MANAGE_ROLES);