// src/app/api/akutansi/jurnal/fix-accessory-accounts/route.ts
//
// ── ONE-TIME REPAIR ──────────────────────────────────────────────────────
// Endpoint sekali-pakai untuk membetulkan entry TRANSACTION lama yang salah
// kepetakan ke akun 410 (Penjualan Laptop) padahal seharusnya 420 (Penjualan
// Aksesoris) atau split 410+420 (untuk transaksi mixed). Ini terjadi karena
// buildTransactionDrafts() dulu selalu hardcode ke 410, sebelum diperbaiki.
//
// Cara pakai: panggil sekali via fetch/Postman (POST, tanpa body), lalu boleh
// dihapus filenya setelah selesai dipakai.
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { AKUN, accountName } from "@/lib/accounting";

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

export const POST = withAuth(async (_req, _ctx, user: any) => {
  const supabase = getAdmin();

  // 1) Ambil semua journal_entries sumber TRANSACTION yang punya baris akun 410
  const { data: entries, error: entriesErr } = await supabase
    .from("journal_entries")
    .select("id, source_id, is_edited, lines:journal_lines(id, account_code, side, nominal, line_order)")
    .eq("source_type", "TRANSACTION");

  if (entriesErr) {
    return NextResponse.json({ success: false, message: entriesErr.message }, { status: 500 });
  }

  const candidates = (entries ?? []).filter((e: any) => {
    if (typeof e.source_id !== "string" || e.source_id.endsWith("-PELUNASAN")) return false;
    return (e.lines ?? []).some((l: any) => l.account_code === AKUN.PENJUALAN_LAPTOP && l.side === "KREDIT");
  });

  if (candidates.length === 0) {
    return NextResponse.json({ success: true, data: { scanned: 0, fixed: 0 } });
  }

  // ✅ FIX (idempotency): kasus "mixed" menyisakan baris 410 dengan nominal
  // yang sudah dikurangi (bukan dihapus) — kalau endpoint ini dipanggil lagi,
  // baris itu masih lolos filter kandidat di atas dan nominalnya dikurangi
  // LAGI. Sekarang entry yang sudah pernah diperbaiki (tercatat di
  // journal_audit_logs) dibuang dari daftar kandidat.
  const candidateIds = candidates.map((e: any) => e.id);
  const alreadyFixedIds = new Set<string>();
  for (const batch of chunkArray(candidateIds, 150)) {
    const { data: logRows } = await supabase
      .from("journal_audit_logs")
      .select("entry_id, before_data")
      .in("entry_id", batch)
      .eq("action", "EDIT");
    for (const row of (logRows ?? []) as any[]) {
      if (row.before_data?.keterangan_action === "fix-accessory-account") {
        alreadyFixedIds.add(row.entry_id);
      }
    }
  }
  const unfixedCandidates = candidates.filter((e: any) => !alreadyFixedIds.has(e.id));

  if (unfixedCandidates.length === 0) {
    return NextResponse.json({
      success: true,
      data: { scanned: candidates.length, fixed_accessory_only: 0, fixed_mixed_split: 0, skipped_already_correct_laptop: 0, skipped_already_fixed: candidates.length },
    });
  }

  // 2) Ambil item_kind & deal_price transaksi terkait
  const invoiceNumbers = unfixedCandidates.map((e: any) => e.source_id as string);
  const trxByInvoice = new Map<string, { item_kind: string | null; deal_price: number }>();

  for (const batch of chunkArray(invoiceNumbers, 150)) {
    const { data: trxRows } = await supabase
      .from("transactions")
      .select("invoice_number, item_kind, deal_price, amount, unit_id, unit_ids")
      .in("invoice_number", batch);
    for (const t of (trxRows ?? []) as any[]) {
      const ids: string[] =
        Array.isArray(t.unit_ids) && t.unit_ids.length > 0 ? t.unit_ids : t.unit_id ? [t.unit_id] : [];
      const effectiveKind =
        t.item_kind === "mixed" || t.item_kind === "accessory" || t.item_kind === "laptop"
          ? t.item_kind
          : ids.length > 0 ? "laptop" : "accessory";
      trxByInvoice.set(t.invoice_number as string, {
        item_kind: effectiveKind,
        deal_price: Math.round(Number(t.deal_price ?? t.amount ?? 0)),
      });
    }
  }

  // 3) Ambil deal_price khusus baris aksesoris (untuk kasus "mixed")
  const mixedInvoices = invoiceNumbers.filter((inv) => trxByInvoice.get(inv)?.item_kind === "mixed");
  const accessoryDealByInvoice = new Map<string, number>();
  if (mixedInvoices.length > 0) {
    for (const batch of chunkArray(mixedInvoices, 150)) {
      const { data: itemRows } = await supabase
        .from("transaction_items")
        .select("invoice_number, item_type, accessory_id, unit_id, deal_price")
        .in("invoice_number", batch);
      for (const it of (itemRows ?? []) as any[]) {
        const isAccessoryItem = it.item_type === "accessory" || (Boolean(it.accessory_id) && !it.unit_id);
        if (!isAccessoryItem) continue;
        const cur = accessoryDealByInvoice.get(it.invoice_number as string) ?? 0;
        accessoryDealByInvoice.set(it.invoice_number as string, cur + Math.round(Number(it.deal_price ?? 0)));
      }
    }
  }

  let fixedAccessoryOnly = 0;
  let fixedMixed = 0;
  let skippedLaptop = 0;

  for (const entry of unfixedCandidates as any[]) {
    const trx = trxByInvoice.get(entry.source_id as string);
    if (!trx) continue;
    if (trx.item_kind === "laptop") { skippedLaptop++; continue; } // memang seharusnya 410, biarkan

    const line410 = (entry.lines ?? []).find((l: any) => l.account_code === AKUN.PENJUALAN_LAPTOP && l.side === "KREDIT");
    if (!line410) continue;

    const before = { keterangan_action: "fix-accessory-account", entry_id: entry.id, lines_before: entry.lines };

    if (trx.item_kind === "accessory") {
      // Full accessory-only → ubah baris 410 jadi 420
      const { error: updErr } = await supabase
        .from("journal_lines")
        .update({ account_code: AKUN.PENJUALAN_AKSESORIS, account_name: accountName(AKUN.PENJUALAN_AKSESORIS) })
        .eq("id", line410.id);
      if (!updErr) fixedAccessoryOnly++;
    } else if (trx.item_kind === "mixed") {
      const accessoryDeal = Math.max(0, Math.min(Number(line410.nominal), accessoryDealByInvoice.get(entry.source_id as string) ?? 0));
      if (accessoryDeal <= 0) continue; // tidak bisa dipecah, biarkan apa adanya

      const laptopDeal = Number(line410.nominal) - accessoryDeal;

      if (laptopDeal <= 0) {
        // Semua ternyata aksesoris
        await supabase
          .from("journal_lines")
          .update({ account_code: AKUN.PENJUALAN_AKSESORIS, account_name: accountName(AKUN.PENJUALAN_AKSESORIS) })
          .eq("id", line410.id);
      } else {
        // Kurangi nominal baris 410, tambah baris baru 420
        await supabase.from("journal_lines").update({ nominal: laptopDeal }).eq("id", line410.id);
        await supabase.from("journal_lines").insert({
          entry_id: entry.id,
          account_code: AKUN.PENJUALAN_AKSESORIS,
          account_name: accountName(AKUN.PENJUALAN_AKSESORIS),
          side: "KREDIT",
          nominal: accessoryDeal,
          keterangan: null,
          line_order: (line410.line_order ?? 0) + 1,
        });
      }
      fixedMixed++;
    }

    await supabase.from("journal_audit_logs").insert({
      entry_id: entry.id,
      period: null,
      action: "EDIT",
      before_data: before,
      after_data: { note: "account_code diperbaiki dari 410 ke 420 (repair otomatis)" },
      changed_by: user.id,
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      scanned: candidates.length,
      fixed_accessory_only: fixedAccessoryOnly,
      fixed_mixed_split: fixedMixed,
      skipped_already_correct_laptop: skippedLaptop,
    },
  });
}, AKUNTANSI_MANAGE_ROLES);