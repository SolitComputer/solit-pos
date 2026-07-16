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
  let body: { line_id?: string; checked?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 });
  }

  const { line_id, checked } = body;
  if (!line_id || typeof checked !== "boolean") {
    return NextResponse.json(
      { success: false, message: "line_id dan checked wajib diisi" },
      { status: 400 }
    );
  }

  const supabase = getAdmin();

  // ⚠️ ASUMSI: withAuth menempelkan info user ke req.user setelah verifikasi.
  // Sesuaikan `user?.id` / `user?.name` dengan bentuk object user di lib/auth.ts Anda
  // (misal bisa jadi req.user.username, req.user.full_name, dll).
  const user = (req as any).user as { id?: string; name?: string } | undefined;

  try {
    if (checked) {
      const { data, error } = await supabase
        .from("journal_line_checks")
        .upsert(
          {
            line_id,
            checked_by: user?.id ?? null,
            checked_by_name: user?.name ?? null,
            checked_at: new Date().toISOString(),
          },
          { onConflict: "line_id" }
        )
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, data });
    } else {
      const { error } = await supabase.from("journal_line_checks").delete().eq("line_id", line_id);
      if (error) throw error;
      return NextResponse.json({ success: true, data: { line_id, checked: false } });
    }
  } catch (error: any) {
    console.error("[buku-besar/check PATCH]", error);
    return NextResponse.json(
      { success: false, message: error?.message ?? "Gagal menyimpan status cek" },
      { status: 500 }
    );
  }
}, AKUNTANSI_ROLES);