// src/lib/accountingSource.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AKUN,
  DerivedSourceType,
  DraftLine,
  accountName,
  cashflowKeterangan,
  expenseAccountForCashflow,
  jakartaDate,
  kasAccountFromCashflow,
  kasAccountFromPaymentMethod,
  mergeLines,
  periodFromDate,
  periodRange,
  totalOf,
} from "@/lib/accounting";

export interface JournalDraft {
  source_type: DerivedSourceType;
  source_id: string;
  source_category: string | null;
  tanggal: string;          // YYYY-MM-DD (WIB) — dipakai untuk grouping/tampilan
  sort_ts: string;          // ISO timestamp presisi — dipakai untuk urutan yang stabil & tidak acak
  keterangan: string;
  ref: string | null;
  lines: DraftLine[];
  total: number;
  meta: Record<string, unknown>;   // untuk badge di UI (status, invoice, dll)
}

export function draftKey(s: { source_type: string; source_id: string }): string {
  return `${s.source_type}:${s.source_id}`;
}

// ── TRANSAKSI ────────────────────────────────────────────────────────────────
async function buildTransactionDrafts(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string
): Promise<JournalDraft[]> {
  const { data: trxs, error } = await supabase
    .from("transactions")
    .select(
      "invoice_number, customer_name, laptop_name, serial_number, status, deal_price, amount, dp_amount, payment_method, payment_method_2, amount_method_1, amount_method_2, unit_id, unit_ids, created_at"
    )
    .in("status", ["PAID", "HELD", "PACKING", "RESERVED"])
    .gte("created_at", startISO)
    .lt("created_at", endISO)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[akuntansi] fetch transactions:", error.message);
    return [];
  }
  if (!trxs || trxs.length === 0) return [];

  // Ambil SN + harga modal dari laptop_units
  const unitIds = new Set<string>();
  for (const t of trxs as any[]) {
    if (t.unit_id) unitIds.add(t.unit_id);
    if (Array.isArray(t.unit_ids)) for (const u of t.unit_ids) if (u) unitIds.add(u);
  }

  const unitMap = new Map<string, { purchase_price: number; serial_number?: string }>();
  if (unitIds.size > 0) {
    const { data: units } = await supabase
      .from("laptop_units")
      .select("id, purchase_price, serial_number")
      .in("id", Array.from(unitIds));
    for (const u of units ?? []) {
      unitMap.set(u.id as string, {
        purchase_price: Math.round(Number(u.purchase_price ?? 0)),
        serial_number: (u.serial_number as string) ?? undefined,
      });
    }
  }

  const drafts: JournalDraft[] = [];

  for (const t of trxs as any[]) {
    const deal = Math.round(Number(t.deal_price ?? t.amount ?? 0));
    if (deal <= 0) continue;

    const ids: string[] =
      Array.isArray(t.unit_ids) && t.unit_ids.length > 0
        ? t.unit_ids
        : t.unit_id
          ? [t.unit_id]
          : [];

    let modal = 0;
    const sns: string[] = [];
    for (const id of ids) {
      const u = unitMap.get(id);
      if (!u) continue;
      modal += u.purchase_price;
      if (u.serial_number) sns.push(u.serial_number);
    }

    const snText = sns.length > 0 ? sns.join(", ") : (t.serial_number as string) || "—";
    // Format keterangan sesuai requirement: tipe laptop - SN - nama customer
    const keterangan = `${t.laptop_name ?? "Laptop"} - ${snText} - ${t.customer_name ?? "—"}`;

    const lines: DraftLine[] = [];

    if (t.status === "PAID") {
      const m2 = (t.payment_method_2 ?? "").trim();
      const a1 = Math.round(Number(t.amount_method_1 ?? 0));
      const a2 = Math.round(Number(t.amount_method_2 ?? 0));

      if (m2 && a1 > 0 && a2 > 0 && a1 + a2 === deal) {
        // Split payment (TF + Tunai)
        lines.push({ account_code: kasAccountFromPaymentMethod(t.payment_method), side: "DEBIT", nominal: a1 });
        lines.push({ account_code: kasAccountFromPaymentMethod(m2), side: "DEBIT", nominal: a2 });
      } else {
        lines.push({ account_code: kasAccountFromPaymentMethod(t.payment_method), side: "DEBIT", nominal: deal });
      }
    } else if (t.status === "HELD") {
      // "Ambil Dulu" → belum bayar = Piutang
      lines.push({ account_code: AKUN.PIUTANG, side: "DEBIT", nominal: deal });
    } else if (t.status === "PACKING") {
      // Pesanan e-commerce yang masih packing
      lines.push({ account_code: AKUN.ECOMMERS, side: "DEBIT", nominal: deal });
    } else if (t.status === "RESERVED") {
      // DP: kas masuk sebesar DP, sisanya piutang
      const dp = Math.min(deal, Math.round(Number(t.dp_amount ?? 0)));
      if (dp > 0) lines.push({ account_code: kasAccountFromPaymentMethod(t.payment_method), side: "DEBIT", nominal: dp });
      const sisa = deal - dp;
      if (sisa > 0) lines.push({ account_code: AKUN.PIUTANG, side: "DEBIT", nominal: sisa });
    }

    lines.push({ account_code: AKUN.PENJUALAN_LAPTOP, side: "KREDIT", nominal: deal });

    // HPP terjual: Modal Keluar (440) ← HPP/Modal (130)
    if (modal > 0) {
      lines.push({ account_code: AKUN.MODAL_KELUAR, side: "DEBIT", nominal: modal });
      lines.push({ account_code: AKUN.HPP, side: "KREDIT", nominal: modal });
    }

    const merged = mergeLines(lines);

    drafts.push({
      source_type: "TRANSACTION",
      source_id: t.invoice_number as string,
      source_category: "PENJUALAN_LAPTOP",
      tanggal: jakartaDate(t.created_at as string),
      sort_ts: t.created_at as string,
      keterangan,
      ref: null,
      lines: merged,
      total: totalOf(merged),
      meta: { status: t.status, invoice: t.invoice_number, deal, modal },
    });
  }

  return drafts;
}

// SESUDAH
async function buildServiceDrafts(
  supabase: SupabaseClient,
  period: string
): Promise<JournalDraft[]> {
  const { data: svcs, error } = await supabase
    .from("service_orders")
    .select(
      "id, nama, type_laptop, payment_amount, payment_method, biaya_sparepart, status, tanggal_masuk, tanggal_selesai, tanggal_diambil"
    )
    .in("status", ["DONE", "SUDAH_DIAMBIL"])
    .not("payment_amount", "is", null)
    .gt("payment_amount", 0);

  if (error) {
    console.error("[akuntansi] fetch service:", error.message);
    throw new Error(`Gagal ambil data service: ${error.message}`);
  }

  const drafts: JournalDraft[] = [];

  for (const s of (svcs ?? []) as any[]) {
    const refDate = (s.tanggal_selesai || s.tanggal_diambil || s.tanggal_masuk) as string;
    if (!refDate) continue;

    const tanggal = jakartaDate(refDate);
    if (periodFromDate(tanggal) !== period) continue;

    const bayar = Math.round(Number(s.payment_amount ?? 0));
    if (bayar <= 0) continue;

    const sparepart = Math.round(Number(s.biaya_sparepart ?? 0));
    const lines: DraftLine[] = [
      { account_code: kasAccountFromPaymentMethod(s.payment_method), side: "DEBIT", nominal: bayar },
      { account_code: AKUN.JASA_SERVICE, side: "KREDIT", nominal: bayar },
    ];

    // Modal sparepart keluar dari stok aksesoris service
    if (sparepart > 0) {
      lines.push({ account_code: AKUN.MODAL_SERVICE_KELUAR, side: "DEBIT", nominal: sparepart });
      lines.push({ account_code: AKUN.AKSESORIS_SERVICE, side: "KREDIT", nominal: sparepart });
    }

    const merged = mergeLines(lines);

    // Timestamp presisi untuk sorting: pakai created_at kalau ada, fallback ke
    // tanggal jam 00:00 supaya tetap konsisten kalau kolomnya null di baris tertentu.
    const sortTs = refDate || `${tanggal}T00:00:00+07:00`;

    drafts.push({
      source_type: "SERVICE",
      source_id: String(s.id),
      source_category: "SERVICE",
      tanggal,
      sort_ts: sortTs,
      keterangan: `Service · ${s.type_laptop ?? "—"} - ${s.nama ?? "—"}`,
      ref: null,
      lines: merged,
      total: totalOf(merged),
      meta: { status: s.status, bayar, sparepart },
    });
  }

  return drafts;
}

// ── CASHFLOW (hanya uang KELUAR) ─────────────────────────────────────────────
async function buildCashflowDrafts(
  supabase: SupabaseClient,
  startDate: string,
  endDateExclusive: string
): Promise<JournalDraft[]> {
  const { data: rows, error } = await supabase
    .from("cashflow_entries")
    .select("id, direction, category, nama, nominal, keterangan, tanggal, payment_method, created_at")
    .eq("direction", "OUT")
    .gte("tanggal", startDate)
    .lt("tanggal", endDateExclusive);

  if (error) {
    console.error("[akuntansi] fetch cashflow:", error.message);
    return [];
  }

  const drafts: JournalDraft[] = [];

  for (const e of (rows ?? []) as any[]) {
    const nominal = Math.round(Number(e.nominal ?? 0));
    if (nominal <= 0) continue;

    const lines: DraftLine[] = [
      { account_code: expenseAccountForCashflow(e.category), side: "DEBIT", nominal },
      { account_code: kasAccountFromCashflow(e.payment_method), side: "KREDIT", nominal },
    ];

    const merged = mergeLines(lines);

    const sortTs = (e.created_at as string) || `${e.tanggal}T00:00:00+07:00`;

    drafts.push({
      source_type: "CASHFLOW",
      source_id: String(e.id),
      source_category: e.category as string,
      tanggal: e.tanggal as string,
      sort_ts: sortTs,
      keterangan: cashflowKeterangan(e),
      ref: null,
      lines: merged,
      total: totalOf(merged),
      meta: { category: e.category, payment_method: e.payment_method, nominal },
    });
  }

  return drafts;
}

// ── Public API ───────────────────────────────────────────────────────────────
export async function buildDraftsForPeriod(
  supabase: SupabaseClient,
  period: string
): Promise<JournalDraft[]> {
  const { startISO, endISO, startDate, endDateExclusive } = periodRange(period);

  const [tx, svc, cf] = await Promise.all([
    buildTransactionDrafts(supabase, startISO, endISO),
    buildServiceDrafts(supabase, period),
    buildCashflowDrafts(supabase, startDate, endDateExclusive),
  ]);

  // Urut deterministik: tanggal dulu (ascending), lalu sort_ts (timestamp presisi,
  // ascending) sebagai tie-break — bukan lagi bergantung urutan Promise.all yang
  // tidak konsisten antar-request.
  return [...tx, ...svc, ...cf].sort((a, b) => {
    if (a.tanggal !== b.tanggal) return a.tanggal.localeCompare(b.tanggal);
    return a.sort_ts.localeCompare(b.sort_ts);
  });
}

/** Semua source yang SUDAH masuk jurnal (lintas periode, anti double-post) */
export async function getPostedKeys(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase
    .from("journal_entries")
    .select("source_type, source_id")
    .not("source_id", "is", null);

  return new Set((data ?? []).map((e: any) => draftKey(e)));
}

/** Ubah draft → rows siap insert ke journal_lines */
export function draftToLineRows(entryId: string, lines: DraftLine[]) {
  return lines.map((l, i) => ({
    entry_id: entryId,
    account_code: l.account_code,
    account_name: accountName(l.account_code),
    side: l.side,
    nominal: Math.round(Number(l.nominal)),
    line_order: i,
  }));
}