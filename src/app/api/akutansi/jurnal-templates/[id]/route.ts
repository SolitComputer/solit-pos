// src/app/api/akutansi/jurnal-templates/[id]/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { DraftLine } from "@/lib/accounting";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const TEMPLATE_SELECT = `
  id, name, lines, created_at, updated_at,
  created_by_user:users!journal_templates_created_by_fkey(id, name)
`;

async function isValidAccountAnywhere(supabase: SupabaseClient, code: string) {
  const { data } = await supabase.from("chart_of_accounts").select("code").eq("code", code).maybeSingle();
  return !!data;
}

// ── PUT /api/akutansi/jurnal-templates/[id] — update isi baris template ────
export const PUT = withAuth(async (req, ctx: any) => {
  const { id } = await ctx.params;
  const body = await req.json();
  const { lines } = body as { lines: DraftLine[] };

  if (!Array.isArray(lines) || lines.length < 2)
    return NextResponse.json({ success: false, message: "Template minimal harus punya 2 baris" }, { status: 400 });

  const supabase = getAdmin();

  for (const l of lines) {
    if (!(await isValidAccountAnywhere(supabase, l.account_code)))
      return NextResponse.json({ success: false, message: `Akun ${l.account_code} tidak dikenal` }, { status: 400 });
    if (l.side !== "DEBIT" && l.side !== "KREDIT")
      return NextResponse.json({ success: false, message: "Side harus DEBIT/KREDIT" }, { status: 400 });
    if (!Number.isFinite(Number(l.nominal)) || Number(l.nominal) < 0)
      return NextResponse.json({ success: false, message: "Nominal tidak boleh negatif" }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from("journal_templates")
    .update({ lines, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(TEMPLATE_SELECT)
    .single();

  if (error) {
    console.error("[jurnal-templates PUT]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: updated });
}, AKUNTANSI_MANAGE_ROLES);

// ── DELETE /api/akutansi/jurnal-templates/[id] — hapus template ────────────
export const DELETE = withAuth(async (req, ctx: any) => {
  const { id } = await ctx.params;
  const supabase = getAdmin();

  const { error } = await supabase.from("journal_templates").delete().eq("id", id);

  if (error) {
    console.error("[jurnal-templates DELETE]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}, AKUNTANSI_MANAGE_ROLES);