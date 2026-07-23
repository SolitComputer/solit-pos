// src/app/api/akutansi/jurnal/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES, AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  AKUN,
  DraftLine,
  isBalanced,
  isValidPeriod,
  cleanManualLines,
  periodFromDate,
  totalOf,
} from "@/lib/accounting";
import { draftToLineRows, getTransactionMetaByInvoices } from "@/lib/accountingSource";

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

async function isValidAccountAnywhere(supabase: SupabaseClient, code: string) {
  const { data } = await supabase.from("chart_of_accounts").select("code").eq("code", code).maybeSingle();
  return !!data;
}

export const GET = withAuth(async (req) => {
  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? "";
  // default "desc" = terbaru dulu. Kirim ?sort=asc untuk terlama ke terbaru.
  const sort = url.searchParams.get("sort") === "asc" ? "asc" : "desc";

  if (!isValidPeriod(period))
    return NextResponse.json({ success: false, message: "Periode tidak valid" }, { status: 400 });

  const supabase = getAdmin();

  const { data, error } = await supabase
    .from("journal_entries")
    .select(ENTRY_SELECT)
    .eq("period", period)
    .order("tanggal", { ascending: sort === "asc" })
    .order("created_at", { ascending: sort === "asc" }); // urutan dalam tanggal yang sama tetap konsisten (dipakai drag-and-drop reorder)

  if (error) {
    console.error("[akuntansi GET jurnal]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const entries = (data ?? []).map((e: any) => ({
    ...e,
    lines: [...(e.lines ?? [])].sort((a: any, b: any) => {
      if (a.side !== b.side) return a.side === "DEBIT" ? -1 : 1;
      return (a.line_order ?? 0) - (b.line_order ?? 0);
    }),
  }));

  // Enrich entry TRANSACTION dengan company_name & spek laptop — data live dari
  // transactions/laptops, karena journal_entries tidak menyimpan kolom ini.
  const trxInvoiceNumbers = entries
    .filter((e: any) => e.source_type === "TRANSACTION" && e.source_id)
    .map((e: any) => e.source_id as string);

  const trxMetaMap = await getTransactionMetaByInvoices(supabase, trxInvoiceNumbers);

  const entriesWithMeta = entries.map((e: any) => {
    if (e.source_type !== "TRANSACTION" || !e.source_id) {
      return { ...e, trx_meta: null };
    }
    const baseMeta = trxMetaMap.get(e.source_id) ?? null;
    // Modal dianggap belum diinput kalau jurnal ini TIDAK punya baris HPP (130) —
    // karena buildTransactionDrafts() cuma menambahkan baris Modal Keluar/HPP saat
    // modal > 0 (lihat accountingSource.ts). Dicek langsung dari baris jurnal yang
    // sudah tersimpan, supaya selalu konsisten dengan apa yang benar-benar diposting —
    // bukan query terpisah ke kolom transactions.inventory_price yang bisa berbeda.
    const hasModalLine = (e.lines ?? []).some((l: any) => l.account_code === AKUN.HPP);
    return {
      ...e,
      trx_meta: {
        ...(baseMeta ?? {}),
        modal_missing: !hasModalLine,
      },
    };
  });

  const totalDebit = entriesWithMeta.reduce(
    (s: number, e: any) =>
      s + e.lines.filter((l: any) => l.side === "DEBIT").reduce((x: number, l: any) => x + Number(l.nominal), 0),
    0
  );
  const totalKredit = entriesWithMeta.reduce(
    (s: number, e: any) =>
      s + e.lines.filter((l: any) => l.side === "KREDIT").reduce((x: number, l: any) => x + Number(l.nominal), 0),
    0
  );

  return NextResponse.json({
    success: true,
    data: entriesWithMeta,
    summary: {
      total_entry: entriesWithMeta.length,
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

  for (const l of lines) {
    if (!(await isValidAccountAnywhere(supabase, l.account_code)))
      return NextResponse.json({ success: false, message: `Akun ${l.account_code} tidak dikenal` }, { status: 400 });
    if (l.side !== "DEBIT" && l.side !== "KREDIT")
      return NextResponse.json({ success: false, message: "Side harus DEBIT/KREDIT" }, { status: 400 });
    if (!Number.isFinite(Number(l.nominal)) || Number(l.nominal) <= 0)
      return NextResponse.json({ success: false, message: "Nominal harus > 0" }, { status: 400 });
  }

  const merged = cleanManualLines(lines);
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