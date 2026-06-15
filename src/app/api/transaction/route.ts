import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get("search") ?? "";
    const status = url.searchParams.get("status") ?? "ALL";

    // ── 1. Fetch transactions ──────────────────────────────────────
    let query = supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false });

    if (status !== "ALL") {
      query = query.eq("status", status);
    }

    if (search.trim()) {
      query = query.or(
        `invoice_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,laptop_name.ilike.%${search}%`
      );
    }

    const { data: transactions, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const allUnitIds = new Set<string>();
    const allLaptopIds = new Set<string>();

    for (const trx of transactions) {
      if (trx.unit_id) allUnitIds.add(trx.unit_id);
      if (Array.isArray(trx.unit_ids)) {
        for (const uid of trx.unit_ids) {
          if (uid) allUnitIds.add(uid);
        }
      }
      if (trx.laptop_id) allLaptopIds.add(trx.laptop_id);
    }

    const unitMap = new Map<string, {
      purchase_price: number;
      serial_number?: string;
      laptop_id?: string;
      selling_price?: number;
    }>();

    if (allUnitIds.size > 0) {
      const { data: units } = await supabase
        .from("laptop_units")
        .select("id, purchase_price, serial_number, laptop_id, selling_price")
        .in("id", Array.from(allUnitIds));

      for (const unit of units ?? []) {
        unitMap.set(unit.id, {
          purchase_price: Number(unit.purchase_price ?? 0),
          serial_number: unit.serial_number ?? undefined,
          laptop_id: unit.laptop_id ?? undefined,
          selling_price: Number(unit.selling_price ?? 0),
        });
      }
    }

    // ── 3b. Batch fetch laptops untuk spek ────────────────────────
    // Langsung dari tabel laptops pakai laptop_id yang ada di transaksi
    // Map: laptop_id → { name, cpu, ram, storage, vga }
    const laptopMap = new Map<string, {
      name?: string;
      cpu?: string;
      ram?: string;
      storage?: string;
      vga?: string;
    }>();

    for (const [, unit] of unitMap) {
      if (unit.laptop_id) allLaptopIds.add(unit.laptop_id);
    }

    if (allLaptopIds.size > 0) {
      const { data: laptops, error: laptopError } = await supabase
        .from("laptops")
        .select("id, laptop_name, cpu, ram, storage, gpu")
        .in("id", Array.from(allLaptopIds));

      if (laptopError) {
        console.error("[GET /api/transaction] laptops fetch error:", laptopError);
      }

      for (const laptop of laptops ?? []) {
        laptopMap.set(laptop.id, {
          name: laptop.laptop_name ?? undefined,
          cpu: laptop.cpu ?? undefined,
          ram: laptop.ram ?? undefined,
          storage: laptop.storage ?? undefined,
          vga: laptop.gpu ?? undefined,
        });
      }
    }

    // ── 4. Enrich setiap transaksi dengan spek + margin ───────────
    const enriched = transactions.map((trx: any) => {
      const dealPrice = Number(trx.deal_price ?? trx.amount ?? 0);

      const unitIds: string[] =
        Array.isArray(trx.unit_ids) && trx.unit_ids.length > 0
          ? trx.unit_ids
          : trx.unit_id ? [trx.unit_id] : [];


      const laptopGroups = new Map<string, {
        laptop_id: string;
        laptop_name: string;
        cpu?: string;
        ram?: string;
        storage?: string;
        vga?: string;
        serial_numbers: string[];
        purchase_price_total: number;
        selling_price_total: number;
        unit_count: number;
      }>();

      let totalPurchasePrice = 0;
      const allSerialNumbers: string[] = [];

      for (const uid of unitIds) {
        const unitData = unitMap.get(uid);
        if (!unitData) continue;

        totalPurchasePrice += unitData.purchase_price;
        if (unitData.serial_number) allSerialNumbers.push(unitData.serial_number);

        // Tentukan laptop_id untuk unit ini
        const laptopId = unitData.laptop_id ?? trx.laptop_id ?? "unknown";
        const specs = laptopMap.get(laptopId);

        if (!laptopGroups.has(laptopId)) {
          laptopGroups.set(laptopId, {
            laptop_id: laptopId,
            laptop_name: specs?.name ?? trx.laptop_name ?? "—",
            cpu: specs?.cpu,
            ram: specs?.ram,
            storage: specs?.storage,
            vga: specs?.vga,
            serial_numbers: [],
            purchase_price_total: 0,
            selling_price_total: 0,
            unit_count: 0,
          });
        }

        const group = laptopGroups.get(laptopId)!;
        if (unitData.serial_number) group.serial_numbers.push(unitData.serial_number);
        group.purchase_price_total += unitData.purchase_price;
        group.selling_price_total += unitData.selling_price ?? 0;
        group.unit_count += 1;
      }

      if (unitIds.length === 0 && trx.laptop_name) {
        const laptopId = trx.laptop_id ?? "legacy";
        const specs = trx.laptop_id ? laptopMap.get(trx.laptop_id) : undefined;
        laptopGroups.set(laptopId, {
          laptop_id: laptopId,
          laptop_name: trx.laptop_name,
          cpu: specs?.cpu ?? trx.cpu,
          ram: specs?.ram ?? trx.ram,
          storage: specs?.storage ?? trx.storage,
          vga: specs?.vga ?? trx.vga,
          serial_numbers: trx.serial_number ? [trx.serial_number] : [],
          purchase_price_total: 0,
          selling_price_total: Number(trx.deal_price ?? trx.amount ?? 0),
          unit_count: 1,
        });
      }

      const grouped_items = Array.from(laptopGroups.values());

      // Hitung margin per group (proporsional dari deal_price)
      // Jika ada multiple laptop, deal_price dibagi proporsional dari selling_price_total
      const totalSellingFromUnits = grouped_items.reduce((s, g) => s + g.selling_price_total, 0);
      const grouped_items_with_margin = grouped_items.map(g => {
        // Alokasi deal_price proporsional
        const proportion = totalSellingFromUnits > 0
          ? g.selling_price_total / totalSellingFromUnits
          : 1 / (grouped_items.length || 1);
        const allocatedDealPrice = Math.round(dealPrice * proportion);
        const margin = allocatedDealPrice - g.purchase_price_total;
        return {
          ...g,
          allocated_deal_price: allocatedDealPrice,
          margin,
        };
      });

      const laptopSpecs = trx.laptop_id ? laptopMap.get(trx.laptop_id) : undefined;
      const margin = totalPurchasePrice > 0 ? dealPrice - totalPurchasePrice : 0;

      return {
        ...trx,
        cpu: trx.cpu || laptopSpecs?.cpu || undefined,
        ram: trx.ram || laptopSpecs?.ram || undefined,
        storage: trx.storage || laptopSpecs?.storage || undefined,
        vga: trx.vga || laptopSpecs?.vga || undefined,
        gpu: trx.gpu || laptopSpecs?.vga || undefined,
        laptop_name: trx.laptop_name || laptopSpecs?.name || undefined,
        serial_numbers: allSerialNumbers.length > 0
          ? allSerialNumbers
          : trx.serial_numbers ?? (trx.serial_number ? [trx.serial_number] : []),
        other: margin,
        purchase_price_current: totalPurchasePrice,
        grouped_items: grouped_items_with_margin,
        is_multi_laptop: grouped_items.length > 1,
      };
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    console.error("[GET /api/transaction]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler);