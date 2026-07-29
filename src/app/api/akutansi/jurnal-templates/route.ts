// src/app/api/akutansi/jurnal-templates/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES, AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
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

// ── GET /api/akutansi/jurnal-templates — daftar template custom ────────────
export const GET = withAuth(async () => {
  const supabase = getAdmin();

  const { data, error } = await supabase
    .from("journal_templates")
    .select(TEMPLATE_SELECT)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[jurnal-templates GET]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? [] });
}, AKUNTANSI_ROLES);

// ── POST /api/akutansi/jurnal-templates — buat template baru ───────────────
export const POST = withAuth(async (req, _ctx, user: any) => {
  const body = await req.json();
  const { name, lines } = body as { name: string; lines: DraftLine[] };

  if (!name?.trim())
    return NextResponse.json({ success: false, message: "Nama template wajib diisi" }, { status: 400 });

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

  const { data: inserted, error } = await supabase
    .from("journal_templates")
    .insert({ name: name.trim(), lines, created_by: user.id })
    .select(TEMPLATE_SELECT)
    .single();

  if (error) {
    console.error("[jurnal-templates POST]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: inserted }, { status: 201 });
}, AKUNTANSI_MANAGE_ROLES);