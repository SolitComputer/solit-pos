// src/app/api/financial-entries/auto-piutang/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { FIXED_ASSET_ROLES } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";
import { AKUN } from "@/lib/accounting";

const supabase: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Fitur sinkron piutang otomatis dari Jurnal Umum (akun 140) MULAI berlaku
// 8 Okt 2026. Piutang yang accrual-nya SEBELUM tanggal ini sengaja tidak
// ditarik — biar data lama tidak membanjiri tab Piutang. Ubah kalau perlu geser.
const AUTO_PIUTANG_CUTOFF = "2026-10-08";

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function hasAccess(request: NextRequest): Promise<boolean> {
  const rolesHeader = request.headers.get("x-user-roles") || "";
  const singleRole = request.headers.get("x-user-role");
  let roles = rolesHeader ? rolesHeader.split(",").filter(Boolean) : singleRole ? [singleRole] : [];
  if (roles.length === 0) {
    try {
      const user = await getCurrentUser();
      if (user) roles = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : [user.role];
    } catch {
      // ignore
    }
  }
  return roles.some((r) => (FIXED_ASSET_ROLES as string[]).includes(r));
}

export async function GET(request: NextRequest) {
  if (!(await hasAccess(request))) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  try {
    // ── 1) Tarik SEMUA journal_lines akun Piutang (140) + entry-nya (paginasi) ──
    type RawRow = {
      side: "DEBIT" | "KREDIT";
      nominal: number;
      journal_entries:
        | { tanggal: string; source_type: string; source_id: string | null }
        | { tanggal: string; source_type: string; source_id: string | null }[]
        | null;
    };
    const rows: RawRow[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("journal_lines")
        .select("side, nominal, journal_entries!inner(tanggal, source_type, source_id)")
        .eq("account_code", AKUN.PIUTANG) // "140"
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(...(data as unknown as RawRow[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // ── 2) Group per invoice (base source_id). net = Debit - Kredit ──
    //    Tanggal accrual diambil dari baris DEBIT 140 di entry UTAMA (source_id
    //    tanpa akhiran "__") — dipakai untuk cek cutoff.
    type Agg = { debit: number; kredit: number; accrualTanggal: string | null };
    const byInvoice = new Map<string, Agg>();
    for (const r of rows) {
      const e = Array.isArray(r.journal_entries) ? r.journal_entries[0] : r.journal_entries;
      if (!e || e.source_type !== "TRANSACTION" || !e.source_id) continue; // cuma piutang transaksi
      const invoice = e.source_id.split("__")[0];
      const agg = byInvoice.get(invoice) ?? { debit: 0, kredit: 0, accrualTanggal: null };
      const nominal = Math.round(Number(r.nominal || 0));
      if (r.side === "DEBIT") {
        agg.debit += nominal;
        if (!e.source_id.includes("__")) agg.accrualTanggal = e.tanggal; // entry accrual utama
      } else {
        agg.kredit += nominal; // pembayaran DP/cicilan/pelunasan → ngurangin
      }
      byInvoice.set(invoice, agg);
    }

    // ── 3) Saring: accrual ≥ cutoff DAN masih ada sisa (> 0) ──
    const eligible: { invoice: string; sisa: number; tanggal: string }[] = [];
    for (const [invoice, agg] of byInvoice.entries()) {
      if (!agg.accrualTanggal) continue;                      // tak ada accrual → skip
      if (agg.accrualTanggal < AUTO_PIUTANG_CUTOFF) continue; // sebelum fitur aktif → skip
      const sisa = agg.debit - agg.kredit;
      if (sisa <= 0) continue;                                 // lunas / dibatalkan → sembunyikan
      eligible.push({ invoice, sisa, tanggal: agg.accrualTanggal });
    }
    if (eligible.length === 0) return NextResponse.json({ success: true, data: [] });

    // ── 4) Detail transaksi untuk judul (customer) & keterangan (barang + SN) ──
    const invoiceNumbers = eligible.map((x) => x.invoice);
    const trxMap = new Map<
      string,
      { customer_name: string; laptop_name: string; serial_number: string | null; unit_id: string | null; unit_ids: string[] | null }
    >();
    for (const batch of chunkArray(invoiceNumbers, 150)) {
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

    // SN per unit → SN per invoice (pola sama persis dgn builder jurnal).
    const unitIds = new Set<string>();
    for (const t of trxMap.values()) {
      if (t.unit_id) unitIds.add(t.unit_id);
      if (Array.isArray(t.unit_ids)) for (const u of t.unit_ids) if (u) unitIds.add(u);
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
    for (const [invoice, t] of trxMap.entries()) {
      const ids = Array.isArray(t.unit_ids) && t.unit_ids.length > 0 ? t.unit_ids : t.unit_id ? [t.unit_id] : [];
      const sns: string[] = [];
      for (const id of ids) {
        const sn = snByUnitId.get(id);
        if (sn) sns.push(sn);
      }
      snTextByInvoice.set(invoice, sns.length > 0 ? sns.join(", ") : t.serial_number || "—");
    }

    // ── 5) Rakit output (read-only, dihitung dari jurnal — tidak tersimpan) ──
    const data = eligible
      .map(({ invoice, sisa, tanggal }) => {
        const t = trxMap.get(invoice);
        const sn = snTextByInvoice.get(invoice) ?? "—";
        return {
          id: `auto:${invoice}`,
          invoice,
          nama: t?.customer_name ?? "—",              // judul = nama customer
          keterangan: `${t?.laptop_name ?? "Laptop"} - ${sn}`, // barang + SN
          nominal: sisa,                               // sisa piutang berjalan
          tanggal,
          source: "jurnal" as const,
        };
      })
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.nominal - a.nominal);

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("[financial-entries/auto-piutang GET]", error);
    return NextResponse.json(
      { success: false, message: error?.message ?? "Gagal memuat piutang otomatis" },
      { status: 500 }
    );
  }
}