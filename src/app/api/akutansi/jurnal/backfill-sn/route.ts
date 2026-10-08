// src/app/api/akutansi/jurnal/backfill-sn/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Harus sama persis dengan TYPE_LABEL di buildTransactionPaymentDrafts(),
// supaya rekonstruksi keterangan LAMA cocok byte-per-byte dengan yang di DB.
const TYPE_LABEL: Record<string, string> = { DP: "DP", CICILAN: "Cicilan", PELUNASAN: "Pelunasan" };

/**
 * POST /api/akutansi/jurnal/backfill-sn[?dry=1]
 *
 * Menambal SN ke keterangan entry jurnal PEMBAYARAN lama (source_id "...__PAY_...")
 * yang dulu diposting tanpa SN. Idempotent & non-destruktif:
 *   - Hanya menimpa entry yang keterangannya MASIH SAMA PERSIS dengan format mesin
 *     lama (tanpa SN). Entry yang sudah diedit manual / sudah punya SN → dilewati.
 *   - ?dry=1 → cuma lihat apa yang AKAN berubah, tidak menulis apa pun ke DB.
 */
export const POST = withAuth(async (req, _ctx, user: any) => {
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  const supabase = getAdmin();

  // ── 1. Ambil SEMUA entry pembayaran (paginasi, bisa > 1000 baris) ──────────
  type Row = { id: string; source_id: string; keterangan: string; period: string };
  const paymentEntries: Row[] = [];
  const PAGE = 1000;
  let fromIdx = 0;
  while (true) {
    const { data, error } = await supabase
      .from("journal_entries")
      .select("id, source_id, keterangan, period")
      .eq("source_type", "TRANSACTION")
      .like("source_id", "%PAY%") // kasar; disaring presisi di JS bawah
      .range(fromIdx, fromIdx + PAGE - 1);
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    paymentEntries.push(...(data as Row[]));
    if (data.length < PAGE) break;
    fromIdx += PAGE;
  }

  // Saring presisi: cuma source_id berpola "<invoice>__PAY_<paymentId>"
  const targets = paymentEntries.filter((e) => e.source_id?.includes("__PAY_"));

  if (targets.length === 0) {
    return NextResponse.json({
      success: true,
      dryRun,
      summary: { scanned: paymentEntries.length, candidates: 0, updated: 0 },
      message: "Tidak ada entry pembayaran yang perlu ditambal.",
    });
  }

  // ── 2. Kumpulkan invoice & paymentId dari source_id ────────────────────────
  const invoiceNumbers = new Set<string>();
  const paymentIds = new Set<string>();
  for (const e of targets) {
    invoiceNumbers.add(e.source_id.split("__")[0]);
    const pid = e.source_id.split("__PAY_")[1];
    if (pid) paymentIds.add(pid);
  }

  // ── 3. transactions: nama + laptop + SN + unit ────────────────────────────
  const trxMap = new Map<
    string,
    { customer_name: string; laptop_name: string; serial_number: string | null; unit_id: string | null; unit_ids: string[] | null }
  >();
  for (const batch of chunkArray(Array.from(invoiceNumbers), 150)) {
    const { data } = await supabase
      .from("transactions")
      .select("invoice_number, customer_name, laptop_name, serial_number, unit_id, unit_ids")
      .in("invoice_number", batch);
    for (const t of (data ?? []) as any[]) {
      trxMap.set(t.invoice_number as string, {
        customer_name: (t.customer_name as string) ?? "—",
        laptop_name: (t.laptop_name as string) ?? "—",
        serial_number: (t.serial_number as string) ?? null,
        unit_id: (t.unit_id as string) ?? null,
        unit_ids: Array.isArray(t.unit_ids) ? t.unit_ids : null,
      });
    }
  }

  // ── 4. transaction_payments: payment_type (buat rekonstruksi keterangan lama) ──
  const paymentTypeMap = new Map<string, string>();
  for (const batch of chunkArray(Array.from(paymentIds), 150)) {
    const { data } = await supabase
      .from("transaction_payments")
      .select("id, payment_type")
      .in("id", batch);
    for (const p of (data ?? []) as any[]) {
      paymentTypeMap.set(String(p.id), (p.payment_type as string) ?? "");
    }
  }

  // ── 5. laptop_units: SN per unit → SN per invoice ─────────────────────────
  const unitIds = new Set<string>();
  for (const trx of trxMap.values()) {
    if (trx.unit_id) unitIds.add(trx.unit_id);
    if (Array.isArray(trx.unit_ids)) for (const u of trx.unit_ids) if (u) unitIds.add(u);
  }
  const snByUnitId = new Map<string, string>();
  if (unitIds.size > 0) {
    for (const batch of chunkArray(Array.from(unitIds), 150)) {
      const { data } = await supabase.from("laptop_units").select("id, serial_number").in("id", batch);
      for (const u of (data ?? []) as any[]) {
        if (u.serial_number) snByUnitId.set(u.id as string, u.serial_number as string);
      }
    }
  }
  const snTextByInvoice = new Map<string, string>();
  for (const [invoice, trx] of trxMap.entries()) {
    const ids = Array.isArray(trx.unit_ids) && trx.unit_ids.length > 0 ? trx.unit_ids : trx.unit_id ? [trx.unit_id] : [];
    const sns: string[] = [];
    for (const id of ids) {
      const sn = snByUnitId.get(id);
      if (sn) sns.push(sn);
    }
    snTextByInvoice.set(invoice, sns.length > 0 ? sns.join(", ") : trx.serial_number || "—");
  }

  // ── 6. Tentukan entry mana yang layak ditambal ────────────────────────────
  const toUpdate: { id: string; period: string; before: string; after: string }[] = [];
  const skipped = { noTrx: 0, noPaymentType: 0, manualOrAlreadySN: 0, noSN: 0 };

  for (const e of targets) {
    const invoice = e.source_id.split("__")[0];
    const paymentId = e.source_id.split("__PAY_")[1];
    const trx = trxMap.get(invoice);
    const pt = paymentId ? paymentTypeMap.get(paymentId) : undefined;

    if (!trx) { skipped.noTrx++; continue; }
    if (!pt) { skipped.noPaymentType++; continue; }

    const label = TYPE_LABEL[pt] ?? pt;
    const oldKet = `Pembayaran ${label} · ${trx.laptop_name} - ${trx.customer_name}`;
    const sn = snTextByInvoice.get(invoice) ?? "—";
    const newKet = `Pembayaran ${label} · ${trx.laptop_name} - ${sn} - ${trx.customer_name}`;

    if (newKet === oldKet) { skipped.noSN++; continue; }            // SN tak ketemu → "—", tidak ada gunanya
    if (e.keterangan !== oldKet) { skipped.manualOrAlreadySN++; continue; } // sudah diedit / sudah ada SN

    toUpdate.push({ id: e.id, period: e.period, before: e.keterangan, after: newKet });
  }

  // ── 7. Dry-run: laporkan saja, jangan menulis ─────────────────────────────
  if (dryRun) {
    return NextResponse.json({
      success: true,
      dryRun: true,
      summary: { scanned: paymentEntries.length, candidates: targets.length, willUpdate: toUpdate.length, skipped },
      preview: toUpdate.slice(0, 50),
    });
  }

  // ── 8. Eksekusi update (+ audit log best-effort) ──────────────────────────
  let updated = 0;
  for (const batch of chunkArray(toUpdate, 25)) {
    await Promise.all(
      batch.map(async (row) => {
        const { error } = await supabase
          .from("journal_entries")
          .update({ keterangan: row.after }) // is_edited sengaja TIDAK diubah — ini backfill, bukan edit user
          .eq("id", row.id)
          .eq("keterangan", row.before); // guard: hanya menimpa kalau masih sama persis (anti-race)
        if (!error) {
          updated++;
          await supabase.from("journal_audit_logs").insert({
            entry_id: row.id,
            period: row.period,
            action: "BACKFILL_SN",
            before_data: { keterangan: row.before },
            after_data: { keterangan: row.after },
            changed_by: user.id,
          }).then(() => {}, () => {}); // abaikan kalau audit gagal
        }
      })
    );
  }

  return NextResponse.json({
    success: true,
    dryRun: false,
    summary: { scanned: paymentEntries.length, candidates: targets.length, updated, skipped },
  });
}, AKUNTANSI_MANAGE_ROLES);