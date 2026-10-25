import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { hasAnyRole, SALES_REPORT_AUDIT_ROLES } from "@/lib/permissions";
import { resolveDateRangeUtc } from "@/lib/marketing-report";

export const dynamic = "force-dynamic";

// Sumber data = tabel Riwayat Transaksi (`transactions`). Route ini
// READ-ONLY — tidak menulis apa pun, jadi Riwayat Transaksi tidak terpengaruh.
const TABLE = "transactions";

function getUserRoles(user: AuthUser): string[] {
  const anyUser = user as any;
  return Array.isArray(anyUser?.roles) && anyUser.roles.length > 0
    ? anyUser.roles
    : [anyUser?.role].filter(Boolean);
}

interface AdsItemRow {
  invoice_number: string;
  created_at: string;
  customer_name: string;
  sales_name: string | null;
  barang: string;
  sumber: string | null;
  nama_toko: string | null;
}

// GET /api/marketing-report/ads-items?from=YYYY-MM-DD&to=YYYY-MM-DD
// Hanya baris transactions dengan from_ads = true dan status BUKAN CANCELLED.
// Dihitung langsung dari tabel asli tiap request — otomatis sinkron,
// tidak mungkin duplikat (lihat catatan di root approach).
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    if (!hasAnyRole(getUserRoles(user), SALES_REPORT_AUDIT_ROLES)) {
      return NextResponse.json({ success: false, message: "Tidak punya akses Laporan Marketing" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const range = resolveDateRangeUtc(searchParams.get("from"), searchParams.get("to"));
    if (!range.success) {
      return NextResponse.json({ success: false, message: range.error }, { status: 400 });
    }
    const { startUtc, endUtc } = range.value;

    let query = supabaseAdmin
      .from(TABLE)
      .select("invoice_number, created_at, customer_name, sales_name, laptop_name, cpu, ram, storage, company_name, source_platform, status")
      .ilike("source_platform", "%ADS%")
      .neq("status", "CANCELLED");
    if (startUtc) query = query.gte("created_at", startUtc);
    if (endUtc) query = query.lt("created_at", endUtc);
    query = query.order("created_at", { ascending: false });

    const { data: transactions, error } = await query;
    if (error) throw new Error(error.message);
    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const invoiceNumbers = transactions.map((t: any) => t.invoice_number);

    // Nama barang + spesifikasi dari transaction_items — sumber paling
    // akurat, ikut berubah kalau unit diganti/ditambah/direstore (beda
    // dengan transactions.laptop_name yang statis sejak create).
    const { data: items, error: itemsErr } = await supabaseAdmin
      .from("transaction_items")
      .select("invoice_number, item_type, laptop_id, accessory_id, unit_id, item_name, restored")
      .in("invoice_number", invoiceNumbers);
    if (itemsErr) throw new Error(itemsErr.message);

    const laptopIds = Array.from(new Set((items ?? []).map((it: any) => it.laptop_id).filter(Boolean)));
    const laptopMap = new Map<string, { name: string; cpu?: string; ram?: string; storage?: string }>();
    if (laptopIds.length > 0) {
      const { data: laptops, error: laptopsErr } = await supabaseAdmin
        .from("laptops")
        .select("id, laptop_name, cpu, ram, storage")
        .in("id", laptopIds);
      if (laptopsErr) throw new Error(laptopsErr.message);
      for (const l of laptops ?? []) {
        laptopMap.set(l.id, { name: l.laptop_name, cpu: l.cpu, ram: l.ram, storage: l.storage });
      }
    }

    const itemsByInvoice = new Map<string, any[]>();
    for (const it of items ?? []) {
      if (!itemsByInvoice.has(it.invoice_number)) itemsByInvoice.set(it.invoice_number, []);
      itemsByInvoice.get(it.invoice_number)!.push(it);
    }

    function describeBarang(trx: any): string {
      const allItems = itemsByInvoice.get(trx.invoice_number) ?? [];
      // Unit yang sudah direstore (restored: true) dikeluarkan — bukan lagi
      // barang yang "berhasil terjual" di transaksi ini.
      const activeItems = allItems.filter((it: any) => !it.restored);

      if (allItems.length === 0) {
        // Transaksi legacy tanpa baris transaction_items — pakai kolom lama.
        const specs = [trx.cpu, trx.ram, trx.storage].filter(Boolean).join(", ");
        return trx.laptop_name ? (specs ? `${trx.laptop_name} (${specs})` : trx.laptop_name) : "—";
      }
      if (activeItems.length === 0) {
        // Semua unit di transaksi ini sudah direstore — tidak ada barang aktif.
        return "— (semua unit direstore)";
      }

      const parts: string[] = [];
      for (const it of activeItems) {
        if (it.item_type === "accessory" || (it.accessory_id && !it.unit_id)) {
          parts.push(it.item_name || "Aksesoris");
          continue;
        }
        const specs = laptopMap.get(it.laptop_id ?? "");
        if (specs) {
          const specStr = [specs.cpu, specs.ram, specs.storage].filter(Boolean).join(", ");
          parts.push(specStr ? `${specs.name} (${specStr})` : specs.name);
        } else {
          parts.push(it.item_name || trx.laptop_name || "—");
        }
      }
      // Dedup barang identik biar tidak terulang kalau beli 3x unit yang sama persis.
      return Array.from(new Set(parts)).join("; ");
    }

    const data: AdsItemRow[] = transactions.map((trx: any) => ({
      invoice_number: trx.invoice_number,
      created_at: trx.created_at,
      customer_name: trx.customer_name ?? "—",
      sales_name: trx.sales_name ?? null,
      barang: describeBarang(trx),
      sumber: trx.source_platform ?? null,
      nama_toko: trx.company_name ?? null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Barang Hasil Ads error:", error);
    return NextResponse.json({ success: false, message: "Gagal memuat Barang Hasil Ads." }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);