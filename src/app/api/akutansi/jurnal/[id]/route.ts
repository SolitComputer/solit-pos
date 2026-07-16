// src/app/api/akuntansi/jurnal/[id]/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  DraftLine,
  isBalanced,
  isValidAccount,
  mergeLines,
  periodFromDate,
  totalOf,
} from "@/lib/accounting";
import { draftToLineRows } from "@/lib/accountingSource";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const ENTRY_SELECT = `
  *,
  created_by_user:users!journal_entries_created_by_fkey(id, name),
  updated_by_user:users!journal_entries_updated_by_fkey(id, name),
  lines:journal_lines(*)
`;

async function snapshot(supabase: SupabaseClient, id: string) {
  const { data } = await supabase
    .from("journal_entries")
    .select("*, lines:journal_lines(account_code, account_name, side, nominal, line_order)")
    .eq("id", id)
    .single();
  return data;
}

async function isValidAccountAnywhere(supabase: SupabaseClient, code: string) {
  const { data } = await supabase.from("chart_of_accounts").select("code").eq("code", code).maybeSingle();
  return !!data;
}

export const PUT = withAuth(async (req, ctx, user: any) => {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ success: false, message: "ID tidak valid" }, { status: 400 });

  const body = await req.json();
  const { tanggal, keterangan, ref, lines } = body as {
    tanggal: string;
    keterangan: string;
    ref?: string | null;
    lines: DraftLine[];
  };

  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal))
    return NextResponse.json({ success: false, message: "Tanggal tidak valid" }, { status: 400 });
  if (!keterangan?.trim())
    return NextResponse.json({ success: false, message: "Keterangan wajib diisi" }, { status: 400 });
  if (!Array.isArray(lines) || lines.length < 2)
    return NextResponse.json({ success: false, message: "Minimal 2 baris (debit & kredit)" }, { status: 400 });

  const supabaseCheck = getAdmin();
  for (const l of lines) {
    if (!(await isValidAccountAnywhere(supabaseCheck, l.account_code)))
      return NextResponse.json({ success: false, message: `Akun ${l.account_code} tidak dikenal` }, { status: 400 });
    if (!Number.isFinite(Number(l.nominal)) || Number(l.nominal) <= 0)
      return NextResponse.json({ success: false, message: "Nominal harus > 0" }, { status: 400 });
  }

  const merged = mergeLines(lines);
  if (!isBalanced(merged))
    return NextResponse.json(
      { success: false, message: "Jurnal tidak balance — total debit harus sama dengan total kredit" },
      { status: 400 }
    );

  const supabase = getAdmin();

  const before = await snapshot(supabase, id);
  if (!before)
    return NextResponse.json({ success: false, message: "Jurnal tidak ditemukan" }, { status: 404 });

  const { error: updErr } = await supabase
    .from("journal_entries")
    .update({
      period: periodFromDate(tanggal),
      tanggal,
      keterangan: keterangan.trim(),
      ref: ref?.trim() || null,
      total: totalOf(merged),
      is_edited: true,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updErr) {
    console.error("[akuntansi PUT]", updErr);
    return NextResponse.json({ success: false, message: updErr.message }, { status: 500 });
  }

  // Replace lines (paling simpel & konsisten dibanding diff per baris)
  await supabase.from("journal_lines").delete().eq("entry_id", id);
  const { error: lineErr } = await supabase.from("journal_lines").insert(draftToLineRows(id, merged));

  if (lineErr) {
    // Rollback: kembalikan baris lama
    await supabase.from("journal_lines").insert(draftToLineRows(id, (before as any).lines ?? []));
    console.error("[akuntansi PUT lines]", lineErr);
    return NextResponse.json({ success: false, message: lineErr.message }, { status: 500 });
  }

  const after = await snapshot(supabase, id);

  await supabase.from("journal_audit_logs").insert({
    entry_id: id,
    period: periodFromDate(tanggal),
    action: "EDIT",
    before_data: before,
    after_data: after,
    changed_by: user.id,
  });

  const { data: full } = await supabase.from("journal_entries").select(ENTRY_SELECT).eq("id", id).single();

  return NextResponse.json({ success: true, data: full });
}, AKUNTANSI_MANAGE_ROLES);

export const DELETE = withAuth(async (_req, ctx, user: any) => {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ success: false, message: "ID tidak valid" }, { status: 400 });

  const supabase = getAdmin();

  const before = await snapshot(supabase, id);
  if (!before)
    return NextResponse.json({ success: false, message: "Jurnal tidak ditemukan" }, { status: 404 });

  await supabase.from("journal_audit_logs").insert({
    entry_id: id,
    period: (before as any).period,
    action: "DELETE",
    before_data: before,
    after_data: null,
    changed_by: user.id,
  });

  const { error } = await supabase.from("journal_entries").delete().eq("id", id);
  if (error) {
    console.error("[akuntansi DELETE]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}, AKUNTANSI_MANAGE_ROLES);