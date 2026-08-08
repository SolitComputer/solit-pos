import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { MONITORING_STOCK_ROLES } from "@/lib/permissions";
import { fetchAllRows } from "@/lib/supabaseFetch";

// ── Helpers ──────────────────────────────────────────────────────────────────

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 jam

// Batasi ukuran query .in() supaya nggak lewat limit panjang URL Supabase/PostgREST —
// query .in() dengan ratusan/ribuan UUID bikin request jadi puluhan KB dan di-reject
// duluan oleh gateway (Kong/PostgREST) sebelum sampai ke database (lihat pola sama
// di api/akutansi/export/route.ts).
const IN_CLAUSE_CHUNK_SIZE = 200;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

interface LaptopRelation {
  id: string;
  laptop_name: string;
  brand: string;
  qty: number;
  status: string;
}

interface UnitRowRaw {
  id: string;
  laptop_id: string;
  serial_number: string;
  grade: string;
  status: string;
  purchase_price: number;
  selling_price: number;
  sparepart_cost: number;
  created_at: string;
  source: string | null;
  laptops: LaptopRelation | null;
}

interface TransactionRow {
  invoice_number: string;
  unit_id: string | null;
  unit_ids: string[] | null;
  serial_number: string | null;
  serial_numbers: string | null;
  created_at: string;
  deal_price: number | null;
  amount: number | null;
  status: string;
}

interface TransactionItemRow {
  unit_id: string;
  invoice_number: string;
  deal_price: number | null;
}

interface UnitRow {
  id: string;
  laptop_id: string;
  serial_number: string;
  grade: string;
  status: string;
  purchase_price: number;
  selling_price: number;
  sparepart_cost: number;
  sold_at: string | null;
  sold_price: number | null;
  created_at: string;
  source: string | null;
  laptops?: {
    id: string;
    laptop_name: string;
    brand: string;
    qty: number;
    status: string;
  } | null;
}

interface AnomalyItem {
  type: "QTY_MISMATCH" | "UNPRICED_READY" | "STALE_RESERVED" | "ORPHAN_SOLD";
  unit_id?: string;
  laptop_id: string;
  serial_number?: string;
  laptop_name: string;
  detail: string;
}

// ── Handler ──────────────────────────────────────────────────────────────────

async function handler(req: NextRequest, ctx: unknown, user: AuthUser) {
  try {
    const allUnitsRaw = await fetchAllRows<UnitRowRaw>((from, to) =>
      supabase
        .from("laptop_units")
        .select(`
          id, laptop_id, serial_number, grade, status,
          purchase_price, selling_price, sparepart_cost,
          created_at, source,
          laptops:laptops ( id, laptop_name, brand, qty, status )
        `)
        .order("created_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: UnitRowRaw[] | null; error: { message: string } | null }>
    );

    // ── Enrich unit SOLD dengan tanggal & harga dari Riwayat Transaksi ───────
    const soldUnitsRaw = allUnitsRaw.filter((u) => u.status === "SOLD");
    const soldUnitIds = soldUnitsRaw.map((u) => u.id);
    const soldUnitIdSet = new Set(soldUnitIds);
    const saleMap = new Map<string, { sold_at: string; sold_price: number }>();

    if (soldUnitIds.length > 0) {
      const soldUnitIdChunks = chunkArray(soldUnitIds, IN_CLAUSE_CHUNK_SIZE);
      const [allTx, txItemChunks] = await Promise.all([
        fetchAllRows<TransactionRow>((from, to) =>
          supabase
            .from("transactions")
            .select("invoice_number, unit_id, unit_ids, serial_number, serial_numbers, created_at, deal_price, amount, status")
            .range(from, to)
        ),
        Promise.all(
          soldUnitIdChunks.map((chunk) =>
            fetchAllRows<TransactionItemRow>((from, to) =>
              supabase
                .from("transaction_items")
                .select("unit_id, invoice_number, deal_price")
                .in("unit_id", chunk)
                .range(from, to)
            )
          )
        ),
      ]);
      const txItems = txItemChunks.flat();

      const txByInvoice = new Map(allTx.map((t) => [t.invoice_number, t]));

      for (const item of txItems) {
        const tx = txByInvoice.get(item.invoice_number);
        if (!tx || tx.status === "CANCELLED") continue;
        const existing = saleMap.get(item.unit_id);
        const candidatePrice = Number(item.deal_price) || Number(tx.deal_price ?? tx.amount ?? 0);
        if (!existing || new Date(tx.created_at) > new Date(existing.sold_at)) {
          saleMap.set(item.unit_id, { sold_at: tx.created_at, sold_price: candidatePrice });
        }
      }

      for (const tx of allTx) {
        if (tx.status === "CANCELLED") continue;

        if (tx.unit_id && soldUnitIdSet.has(tx.unit_id) && !saleMap.has(tx.unit_id)) {
          saleMap.set(tx.unit_id, {
            sold_at: tx.created_at,
            sold_price: Number(tx.deal_price ?? tx.amount ?? 0),
          });
        }

        const ids: string[] = Array.isArray(tx.unit_ids) ? tx.unit_ids : [];
        if (ids.length > 0) {
          const count = ids.length;
          for (const uid of ids) {
            if (!soldUnitIdSet.has(uid) || saleMap.has(uid)) continue;
            saleMap.set(uid, {
              sold_at: tx.created_at,
              sold_price: Math.round(Number(tx.deal_price ?? tx.amount ?? 0) / count),
            });
          }
        }
      }

      const splitSerials = (str: unknown): string[] => {
        if (!str) return [];
        if (typeof str === "number") return [String(str)];
        if (Array.isArray(str)) return str.map((s) => String(s).trim()).filter(Boolean);
        if (typeof str !== "string") return [String(str)];
        return str.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      };

      const soldSerialToId = new Map<string, string>();
      for (const u of soldUnitsRaw) {
        if (u.serial_number) soldSerialToId.set(u.serial_number, u.id);
      }

      if (soldSerialToId.size > 0) {
        for (const tx of allTx) {
          if (tx.status === "CANCELLED") continue;
          const serials = [...splitSerials(tx.serial_numbers), ...splitSerials(tx.serial_number)];
          if (serials.length === 0) continue;
          const count = serials.length;
          for (const sn of serials) {
            const uid = soldSerialToId.get(sn);
            if (!uid || saleMap.has(uid)) continue;
            saleMap.set(uid, {
              sold_at: tx.created_at,
              sold_price: Math.round(Number(tx.deal_price ?? tx.amount ?? 0) / count),
            });
          }
        }
      }
    }

    const allUnits: UnitRow[] = allUnitsRaw.map((u) => {
      const sale = saleMap.get(u.id);
      return {
        ...u,
        sold_at: sale?.sold_at ?? null,
        sold_price: sale?.sold_price ?? null,
      } as UnitRow;
    });

    // 2) Ambil semua parent laptop untuk cross-check qty
    const allLaptops = await fetchAllRows<LaptopRelation>((from, to) =>
      supabase
        .from("laptops")
        .select("id, laptop_name, brand, qty, status")
        .range(from, to)
    );

    const now = Date.now();

    // ── Metrics ────────────────────────────────────────────────────────────
    const siapJual = allUnits.filter((u) => u.status === "SIAP_JUAL");
    const sold = allUnits.filter((u) => u.status === "SOLD");
    const belumSiap = allUnits.filter((u) => u.status === "BELUM_SIAP");
    const inTransit = allUnits.filter((u) =>
      ["RESERVED", "HELD", "PACKING"].includes(u.status)
    );
    const service = allUnits.filter((u) => u.status === "SERVICE");

    const totalNilaiModal = siapJual.reduce(
      (s, u) => s + (Number(u.purchase_price) || 0) + (Number(u.sparepart_cost) || 0),
      0
    );
    const totalNilaiJual = siapJual.reduce(
      (s, u) => s + (Number(u.selling_price) || 0),
      0
    );

    // ── Anomaly Detection ──────────────────────────────────────────────────
    const anomalies: AnomalyItem[] = [];

    // (a) QTY_MISMATCH — laptops.qty != count(SIAP_JUAL units)
    const siapJualCountByLaptop = new Map<string, number>();
    for (const u of allUnits) {
      if (u.status === "SIAP_JUAL") {
        siapJualCountByLaptop.set(
          u.laptop_id,
          (siapJualCountByLaptop.get(u.laptop_id) ?? 0) + 1
        );
      }
    }
    for (const laptop of allLaptops) {
      const actualQty = siapJualCountByLaptop.get(laptop.id) ?? 0;
      const recordedQty = laptop.qty ?? 0;
      if (actualQty !== recordedQty) {
        anomalies.push({
          type: "QTY_MISMATCH",
          laptop_id: laptop.id,
          laptop_name: laptop.laptop_name,
          detail: `Qty tercatat: ${recordedQty}, unit SIAP_JUAL aktual: ${actualQty}`,
        });
      }
    }

    // (b) UNPRICED_READY — SIAP_JUAL tapi purchase_price atau selling_price <= 0
    for (const u of siapJual) {
      const hasPurchase = Number(u.purchase_price) > 0;
      const hasSelling = Number(u.selling_price) > 0;
      if (!hasPurchase || !hasSelling) {
        const missing = [];
        if (!hasPurchase) missing.push("Harga Modal");
        if (!hasSelling) missing.push("Harga Jual");
        anomalies.push({
          type: "UNPRICED_READY",
          unit_id: u.id,
          laptop_id: u.laptop_id,
          serial_number: u.serial_number,
          laptop_name: u.laptops?.laptop_name ?? "—",
          detail: `${missing.join(" & ")} belum diisi`,
        });
      }
    }

    // (c) STALE_RESERVED — RESERVED/HELD/PACKING > 24 jam
    for (const u of inTransit) {
      const age = now - new Date(u.created_at).getTime();
      if (age > STALE_THRESHOLD_MS) {
        const hours = Math.round(age / (60 * 60 * 1000));
        anomalies.push({
          type: "STALE_RESERVED",
          unit_id: u.id,
          laptop_id: u.laptop_id,
          serial_number: u.serial_number,
          laptop_name: u.laptops?.laptop_name ?? "—",
          detail: `Status "${u.status}" sudah ${hours} jam (> 24 jam)`,
        });
      }
    }

    // (d) ORPHAN_SOLD — status SOLD tapi sold_at kosong
    for (const u of sold) {
      if (!u.sold_at) {
        anomalies.push({
          type: "ORPHAN_SOLD",
          unit_id: u.id,
          laptop_id: u.laptop_id,
          serial_number: u.serial_number,
          laptop_name: u.laptops?.laptop_name ?? "—",
          detail: "Status SOLD tetapi tanggal terjual (sold_at) kosong",
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        metrics: {
          siapJual: siapJual.length,
          sold: sold.length,
          belumSiap: belumSiap.length,
          inTransit: inTransit.length,
          service: service.length,
          totalUnit: allUnits.length,
          totalNilaiModal,
          totalNilaiJual,
        },
        anomalies,
        anomalyCount: anomalies.length,
        units: {
          siapJual: siapJual.map(mapUnit),
          sold: sold.map(mapUnit),
          inTransit: inTransit.map(mapUnit),
        },
      },
    });
  } catch (err: any) {
    console.error("[monitoring]", err);
    return NextResponse.json(
      { success: false, message: err?.message || String(err) },
      { status: 500 }
    );
  }
}

function mapUnit(u: UnitRow) {
  return {
    id: u.id,
    laptop_id: u.laptop_id,
    serial_number: u.serial_number ?? "",
    grade: u.grade ?? "—",
    status: u.status ?? "—",
    purchase_price: Number(u.purchase_price) || 0,
    selling_price: Number(u.selling_price) || 0,
    sparepart_cost: Number(u.sparepart_cost) || 0,
    sold_at: u.sold_at,
    sold_price: u.sold_price != null ? Number(u.sold_price) : null,
    created_at: u.created_at,
    source: u.source,
    laptop_name: u.laptops?.laptop_name ?? "—",
    brand: u.laptops?.brand ?? "",
  };
}

export const GET = withAuth(handler, MONITORING_STOCK_ROLES);
