// src/app/api/akutansi/jurnal/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES, AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  DraftLine,
  isBalanced,
  isValidPeriod,
  mergeLines,
  periodFromDate,
  totalOf,
} from "@/lib/accounting";
import { draftToLineRows } from "@/lib/accountingSource";
import { getAccountMap } from "@/lib/chartOfAccounts";

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

// ── GET /api/akuntansi/jurnal?period=2026-07 ─────────────────────────────────
export const GET = withAuth(async (req) => {
  const period = new URL(req.url).searchParams.get("period") ?? "";
  if (!isValidPeriod(period))
    return NextResponse.json({ success: false, message: "Periode tidak valid" }, { status: 400 });

  const supabase = getAdmin();

  const { data, error } = await supabase
    .from("journal_entries")
    .select(ENTRY_SELECT)
    .eq("period", period)
    .order("tanggal", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[akuntansi GET jurnal]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  // Urutkan baris: DEBIT dulu, lalu KREDIT (sesuai tampilan jurnal umum)
  const entries = (data ?? []).map((e: any) => ({
    ...e,
    lines: [...(e.lines ?? [])].sort((a: any, b: any) => {
      if (a.side !== b.side) return a.side === "DEBIT" ? -1 : 1;
      return (a.line_order ?? 0) - (b.line_order ?? 0);
    }),
  }));

  const totalDebit = entries.reduce(
    (s: number, e: any) =>
      s + e.lines.filter((l: any) => l.side === "DEBIT").reduce((x: number, l: any) => x + Number(l.nominal), 0),
    0
  );
  const totalKredit = entries.reduce(
    (s: number, e: any) =>
      s + e.lines.filter((l: any) => l.side === "KREDIT").reduce((x: number, l: any) => x + Number(l.nominal), 0),
    0
  );

  return NextResponse.json({
    success: true,
    data: entries,
    summary: {
      total_entry: entries.length,
      total_debit: totalDebit,
      total_kredit: totalKredit,
      balanced: totalDebit === totalKredit,
    },
  });
}, AKUNTANSI_ROLES);

// ── POST /api/akuntansi/jurnal — jurnal MANUAL ───────────────────────────────
export const POST = withAuth(async (req, _ctx, user: any) => {
  const body = await req.json();
  const { tanggal, keterangan, ref, source_category, lines } = body as {
    tanggal: string;
    keterangan: string;
    ref?: string | null;
    source_category?: string | null;
    lines: DraftLine[];
  };

  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal))
    return NextResponse.json({ success: false, message: "Tanggal tidak valid" }, { status: 400 });

  if (!keterangan?.trim())
    return NextResponse.json({ success: false, message: "Keterangan wajib diisi" }, { status: 400 });

  if (!Array.isArray(lines) || lines.length < 2)
    return NextResponse.json({ success: false, message: "Minimal 2 baris (debit & kredit)" }, { status: 400 });

  const supabase = getAdmin();
  const accountMap = await getAccountMap(supabase);

  for (const l of lines) {
    if (!accountMap.has(l.account_code))
      return NextResponse.json({ success: false, message: `Akun ${l.account_code} tidak dikenal` }, { status: 400 });
    if (l.side !== "DEBIT" && l.side !== "KREDIT")
      return NextResponse.json({ success: false, message: "Side harus DEBIT/KREDIT" }, { status: 400 });
    if (!Number.isFinite(Number(l.nominal)) || Number(l.nominal) <= 0)
      return NextResponse.json({ success: false, message: "Nominal harus > 0" }, { status: 400 });
  }

  const merged = mergeLines(lines);
  if (!isBalanced(merged))
    return NextResponse.json(
      { success: false, message: "Jurnal tidak balance — total debit harus sama dengan total kredit" },
      { status: 400 }
    );

  const { data: entry, error: entryErr } = await supabase
    .from("journal_entries")
    .insert({
      period: periodFromDate(tanggal),
      tanggal,
      keterangan: keterangan.trim(),
      ref: ref?.trim() || null,
      source_type: "MANUAL",
      source_id: null,
      source_category: source_category ?? null,
      total: totalOf(merged),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (entryErr || !entry) {
    console.error("[akuntansi POST manual]", entryErr);
    return NextResponse.json({ success: false, message: entryErr?.message ?? "Gagal simpan" }, { status: 500 });
  }

  const { error: lineErr } = await supabase
    .from("journal_lines")
    .insert(draftToLineRows(entry.id, merged));

  if (lineErr) {
    await supabase.from("journal_entries").delete().eq("id", entry.id);
    console.error("[akuntansi POST manual lines]", lineErr);
    return NextResponse.json({ success: false, message: lineErr.message }, { status: 500 });
  }

  await supabase.from("journal_audit_logs").insert({
    entry_id: entry.id,
    period: periodFromDate(tanggal),
    action: "CREATE",
    before_data: null,
    after_data: { tanggal, keterangan, ref: ref ?? null, lines: merged },
    changed_by: user.id,
  });

  const { data: full } = await supabase.from("journal_entries").select(ENTRY_SELECT).eq("id", entry.id).single();

  return NextResponse.json({ success: true, data: full }, { status: 201 });
}, AKUNTANSI_MANAGE_ROLES);