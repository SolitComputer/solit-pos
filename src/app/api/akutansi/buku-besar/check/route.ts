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

export const PATCH = withAuth(async (req, _props, user) => {
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

  // (fix) Root cause sebenarnya: withAuth TIDAK PERNAH menempel user ke `req.user`.
  // Lihat src/lib/auth.ts — handler dipanggil `handler(req, ctx, user)`, jadi `user`
  // dikirim sebagai ARGUMEN KE-3, bukan properti di object req. Makanya
  // `(req as any).user` di atas selalu undefined → checked_by DAN checked_by_name
  // selalu null (cocok persis sama hasil query SQL kamu). AuthUser.name dijamin
  // selalu ada, jadi gak perlu fallback ke field lain lagi.
  const checkedByName = user.name ?? null;

  try {
    if (checked) {
      const { data, error } = await supabase
        .from("journal_line_checks")
        .upsert(
          {
            line_id,
            checked_by: user.id,
            checked_by_name: checkedByName,
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