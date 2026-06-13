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

    // ── 2. Kumpulkan semua ID yang perlu di-fetch ──────────────────
    const allUnitIds = new Set<string>();
    const allLaptopIds = new Set<string>();

    for (const trx of transactions) {
      // Unit IDs untuk purchase_price + serial_number
      if (trx.unit_id) allUnitIds.add(trx.unit_id);
      if (Array.isArray(trx.unit_ids)) {
        for (const uid of trx.unit_ids) {
          if (uid) allUnitIds.add(uid);
        }
      }
      // Laptop ID untuk spek (cpu, ram, storage, vga)
      // laptop_id sudah ada langsung di row transaksi!
      if (trx.laptop_id) allLaptopIds.add(trx.laptop_id);
    }

    // ── 3a. Batch fetch laptop_units untuk purchase_price ──────────
    // Map: unit_id → { purchase_price, serial_number }
    const unitMap = new Map<string, {
      purchase_price: number;
      serial_number?: string;
    }>();

    if (allUnitIds.size > 0) {
      const { data: units } = await supabase
        .from("laptop_units")
        .select("id, purchase_price, serial_number")
        .in("id", Array.from(allUnitIds));

      for (const unit of units ?? []) {
        unitMap.set(unit.id, {
          purchase_price: Number(unit.purchase_price ?? 0),
          serial_number: unit.serial_number ?? undefined,
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

    if (allLaptopIds.size > 0) {
      const { data: laptops, error: laptopError } = await supabase
        .from("laptops")
        .select("id, laptop_name, cpu, ram, storage, gpu") // ← fix: name→laptop_name, vga→gpu
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
      let totalPurchasePrice = 0;

      // Normalisasi unit_ids jadi array tunggal
      const unitIds: string[] =
        Array.isArray(trx.unit_ids) && trx.unit_ids.length > 0
          ? trx.unit_ids
          : trx.unit_id ? [trx.unit_id] : [];

      // Kumpulkan serial_numbers dari unit
      const serialNumbers: string[] = [];

      for (const uid of unitIds) {
        const unitData = unitMap.get(uid);
        if (!unitData) continue;
        totalPurchasePrice += unitData.purchase_price;
        if (unitData.serial_number) serialNumbers.push(unitData.serial_number);
      }

      // Ambil spek dari laptopMap pakai laptop_id transaksi
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
        serial_numbers:
          serialNumbers.length > 0
            ? serialNumbers
            : trx.serial_numbers ?? (trx.serial_number ? [trx.serial_number] : []),
        other: margin,
        purchase_price_current: totalPurchasePrice,
      };
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    console.error("[GET /api/transaction]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler);