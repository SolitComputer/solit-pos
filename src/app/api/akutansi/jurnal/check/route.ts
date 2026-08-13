// src/app/api/akutansi/jurnal/check/route.ts
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

export const PATCH = withAuth(async (req) => {
  const body = await req.json();
  const { line_id, checked } = body as { line_id: string; checked: boolean };

  if (!line_id) {
    return NextResponse.json({ success: false, message: "line_id wajib diisi" }, { status: 400 });
  }

  const supabase = getAdmin();

  if (checked) {
    const { error } = await supabase
      .from("journal_umum_line_checks")
      .upsert({ line_id, checked_at: new Date().toISOString() }, { onConflict: "line_id" });

    if (error) {
      console.error("[jurnal/check PATCH upsert]", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from("journal_umum_line_checks")
      .delete()
      .eq("line_id", line_id);

    if (error) {
      console.error("[jurnal/check PATCH delete]", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}, AKUNTANSI_ROLES);