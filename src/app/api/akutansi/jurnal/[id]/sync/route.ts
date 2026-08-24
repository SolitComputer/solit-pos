// src/app/api/akutansi/jurnal/[id]/sync/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { linesEqual } from "@/lib/accounting";
import {
  draftToLineRows,
  getTransactionSyncDraftsByInvoices,
  getCashflowSyncDraftsByIds,
  getServiceSyncDraftsByIds,
  JournalSyncDraft,
} from "@/lib/accountingSource";

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

// ── POST /api/akutansi/jurnal/[id]/sync ──────────────────────────────────────
// Sinkronkan ulang baris jurnal (nominal debit/kredit) sebuah entry supaya
// sama persis dengan data SUMBER-nya yang sekarang — mencakup TRANSACTION
// (penjualan langsung), CASHFLOW (entry manual), dan SERVICE (entry tunggal,
// belum pernah dipecah DP/Cicilan/Pelunasan). Lihat JSDoc masing-masing
// fungsi getXxxSyncDraftsByIds/Invoices di accountingSource.ts untuk batasan
// detailnya — sengaja dibatasi supaya sync tidak pernah mengubah TIPE entry
// (mis. Piutang jadi Kas) atau salah hitung ulang pembayaran bertahap.
export const POST = withAuth(async (_req, ctx, user: any) => {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ success: false, message: "ID tidak valid" }, { status: 400 });

  const supabase = getAdmin();

  const { data: before, error: beforeErr } = await supabase
    .from("journal_entries")
    .select("*, lines:journal_lines(account_code, account_name, side, nominal, line_order)")
    .eq("id", id)
    .single();

  if (beforeErr || !before)
    return NextResponse.json({ success: false, message: "Jurnal tidak ditemukan" }, { status: 404 });

  if (!before.source_id) {
    return NextResponse.json(
      { success: false, message: "Sinkronisasi cuma berlaku untuk jurnal dari Transaksi/Cashflow/Service" },
      { status: 400 }
    );
  }

  let draft: JournalSyncDraft | undefined;

  if (before.source_type === "TRANSACTION") {
    const invoiceNumber = before.source_id as string;
    if (invoiceNumber.includes("__")) {
      return NextResponse.json(
        { success: false, message: "Sinkronisasi cuma berlaku untuk entry utama transaksi (bukan cicilan/DP)" },
        { status: 400 }
      );
    }
    const beforeLines = ((before as any).lines ?? []) as { account_code: string; side: string }[];
    const isKasShaped = beforeLines.some((l) => l.side === "DEBIT" && (l.account_code === "110" || l.account_code === "120"));
    if (!isKasShaped) {
      return NextResponse.json(
        { success: false, message: "Sinkronisasi cuma berlaku untuk entry penjualan langsung (debit Kas)" },
        { status: 400 }
      );
    }
    const draftMap = await getTransactionSyncDraftsByInvoices(supabase, [invoiceNumber]);
    draft = draftMap.get(invoiceNumber);
    if (!draft) {
      return NextResponse.json(
        { success: false, message: "Data transaksi sumber tidak ditemukan / status transaksi bukan PAID" },
        { status: 404 }
      );
    }
  } else if (before.source_type === "CASHFLOW") {
    const draftMap = await getCashflowSyncDraftsByIds(supabase, [before.source_id as string]);
    draft = draftMap.get(before.source_id as string);
    if (!draft) {
      return NextResponse.json(
        { success: false, message: "Data cashflow sumber tidak ditemukan, atau bukan entry manual" },
        { status: 404 }
      );
    }
  } else if (before.source_type === "SERVICE") {
    const baseId = (before.source_id as string).split("__")[0];
    if (before.source_id !== baseId) {
      return NextResponse.json(
        { success: false, message: "Sinkronisasi cuma berlaku untuk service yang belum dipecah DP/Cicilan/Pelunasan" },
        { status: 400 }
      );
    }
    const draftMap = await getServiceSyncDraftsByIds(supabase, [baseId]);
    draft = draftMap.get(baseId);
    if (!draft) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Data service sumber tidak ditemukan, atau service ini sudah punya lebih dari satu entry jurnal (DP/Cicilan/Pelunasan)",
        },
        { status: 404 }
      );
    }
  } else {
    return NextResponse.json(
      { success: false, message: "Sinkronisasi cuma berlaku untuk jurnal dari Transaksi/Cashflow/Service" },
      { status: 400 }
    );
  }

  if (linesEqual((before.lines ?? []) as any, draft.lines)) {
    return NextResponse.json(
      { success: false, message: "Nominal jurnal sudah sama dengan data sumber terbaru" },
      { status: 400 }
    );
  }

  // Replace baris lama dengan draft baru
  await supabase.from("journal_lines").delete().eq("entry_id", id);
  const { error: lineErr } = await supabase.from("journal_lines").insert(draftToLineRows(id, draft.lines));

  if (lineErr) {
    // Rollback: kembalikan baris lama supaya jurnal tidak tiba-tiba kosong
    await supabase.from("journal_lines").insert(draftToLineRows(id, (before as any).lines ?? []));
    console.error("[akuntansi POST sync lines]", lineErr);
    return NextResponse.json({ success: false, message: lineErr.message }, { status: 500 });
  }

  const { error: updErr } = await supabase
    .from("journal_entries")
    .update({
      total: draft.total,
      is_edited: true,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updErr) {
    console.error("[akuntansi POST sync entry]", updErr);
    return NextResponse.json({ success: false, message: updErr.message }, { status: 500 });
  }

  const { data: after } = await supabase
    .from("journal_entries")
    .select("*, lines:journal_lines(account_code, account_name, side, nominal, line_order)")
    .eq("id", id)
    .single();

  await supabase.from("journal_audit_logs").insert({
    entry_id: id,
    period: before.period,
    action: "SYNC",
    before_data: before,
    after_data: after,
    changed_by: user.id,
  });

  const { data: full } = await supabase.from("journal_entries").select(ENTRY_SELECT).eq("id", id).single();

  return NextResponse.json({ success: true, data: full });
}, AKUNTANSI_MANAGE_ROLES);