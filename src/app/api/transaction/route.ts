import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/services/supabaseAdmin";
import { withAuth } from "@/lib/auth";

function splitSerials(raw: any): string[] {
  if (Array.isArray(raw)) return raw.filter(Boolean).map((s: string) => String(s).trim()).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

// ── Sanitasi term sebelum ditaruh mentah di string filter PostgREST (.or()) ──
// Karakter koma/kurung punya arti khusus di syntax filter Supabase — kalau
// tidak dibuang, user bisa menyisipkan kondisi filter tambahan lewat kotak
// pencarian (filter injection). Dibuang saja karena tidak berguna untuk
// pencarian teks biasa.
function sanitizeFilterTerm(raw: string): string {
  return raw.replace(/[,()]/g, "").trim();
}

// ── Whitelist kolom yang boleh dipakai buat ORDER BY ──────────────────
// Key = nilai `sortBy` yang dikirim client, value = nama kolom asli di tabel `transactions`.
// Pakai whitelist supaya tidak ada celah injection lewat query string.
const SORTABLE_COLUMNS: Record<string, string> = {
  invoice: "invoice_number",
  date: "created_at",
  status: "status",
  customer: "customer_name",
  phone: "customer_phone",
  sales: "sales_name",
  laptop: "laptop_name",
  cpu: "cpu",
  sn: "serial_number",
  price: "deal_price",
  method: "payment_method",
  source: "source_platform",
  company: "company_name",
};

// ── Filter "Toko/Perusahaan" — replikasi persis logic yang dulu dikerjakan di client ──
function applyCompanyFilter(query: any, companyName: string) {
  const q = companyName.toLowerCase();
  if (q === "sotech") return query.ilike("company_name", "%sotech%");
  if (q === "solit") {
    return query
      .ilike("company_name", "%solit%")
      .not("company_name", "ilike", "%sotech%")
      .not("company_name", "ilike", "%onpoint%")
      .not("company_name", "ilike", "%on point%");
  }
  if (q === "onpoint") return query.or("company_name.ilike.%onpoint%,company_name.ilike.%on point%");
  if (q === "zenit.id") return query.ilike("company_name", "%zenit.id%");
  if (q === "zenit") return query.ilike("company_name", "%zenit%").not("company_name", "ilike", "%zenit.id%");
  return query.eq("company_name", companyName);
}

async function handler(req: NextRequest) {
  try {
    const url = new URL(req.url);

    // ── Mode "meta": cuma buat isi dropdown filter (payment method / platform), dipanggil sekali saat mount ──
    if (url.searchParams.get("meta") === "1") {
      const [{ data: pm }, { data: sp }] = await Promise.all([
        supabase.from("transactions").select("payment_method"),
        supabase.from("transactions").select("source_platform"),
      ]);
      const paymentMethods = Array.from(new Set((pm ?? []).map((r: any) => r.payment_method).filter(Boolean)));
      const sourcePlatforms = Array.from(new Set((sp ?? []).map((r: any) => r.source_platform).filter(Boolean)));
      return NextResponse.json({ success: true, paymentMethods, sourcePlatforms });
    }

    const search = url.searchParams.get("search") ?? "";
    const snList = (url.searchParams.get("snList") ?? "")
      .split(/[\s,;]+/)
      .map((s) => sanitizeFilterTerm(s.trim()))
      .filter(Boolean);
    const status = url.searchParams.get("status") ?? "ALL";
    const invoiceExact = url.searchParams.get("invoiceExact") ?? "";
    const isExport = url.searchParams.get("export") === "1";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10) || 25));
    const dateFrom = url.searchParams.get("dateFrom") ?? "";
    const dateTo = url.searchParams.get("dateTo") ?? "";
    const paymentMethod = url.searchParams.get("paymentMethod") ?? "ALL";
    const sourcePlatform = url.searchParams.get("sourcePlatform") ?? "ALL";
    const customerType = url.searchParams.get("customerType") ?? "ALL";
    const companyName = url.searchParams.get("companyName") ?? "ALL";
    const itemKind = url.searchParams.get("itemKind") ?? "ALL";
    const sortOrder = url.searchParams.get("sortOrder") === "oldest" ? "oldest" : "newest";

    // ── Sorting per kolom (klik header tabel) ──────────────────────────
    // sortBy  : key dari SORTABLE_COLUMNS. Kalau kosong / tidak dikenal → fallback ke created_at.
    // sortDir : "asc" | "desc". Kalau kosong → ikut sortOrder lama (biar tombol Terbaru/Terlama tetap jalan).
    const rawSortBy = url.searchParams.get("sortBy") ?? "";
    const rawSortDir = url.searchParams.get("sortDir");
    const sortColumn = SORTABLE_COLUMNS[rawSortBy] ?? "created_at";
    const ascending =
      rawSortDir === "asc" ? true : rawSortDir === "desc" ? false : sortOrder === "oldest";

    let query = supabase.from("transactions").select("*", { count: isExport ? undefined : "exact" });

    if (invoiceExact.trim()) {
      // Deep-link (mis. dari Cashflow) → cocokkan invoice persis, abaikan filter lain
      query = query.eq("invoice_number", invoiceExact.trim());
    } else {
      if (status !== "ALL") query = query.eq("status", status);

      if (snList.length > 0) {
        const { data: snItemMatches } = await supabase
          .from("transaction_items")
          .select("invoice_number")
          .or(snList.map((token) => `serial_number.ilike.%${token}%`).join(","));

        const snInvoiceNumbers = new Set<string>(
          (snItemMatches ?? []).map((r: any) => r.invoice_number).filter(Boolean)
        );

        const snOrParts = snList.map((token) => `serial_number.ilike.%${token}%`);
        if (snInvoiceNumbers.size > 0) {
          snOrParts.push(`invoice_number.in.(${Array.from(snInvoiceNumbers).join(",")})`);
        }

        query = query.or(snOrParts.join(","));
      } else if (search.trim()) {
        const term = sanitizeFilterTerm(search.trim());

        const [{ data: snMatches }, { data: cpuLaptops }] = await Promise.all([
          supabase.from("transaction_items").select("invoice_number").ilike("serial_number", `%${term}%`),
          supabase.from("laptops").select("id").ilike("cpu", `%${term}%`),
        ]);

        const extraInvoiceNumbers = new Set<string>(
          (snMatches ?? []).map((r: any) => r.invoice_number).filter(Boolean)
        );

        if (cpuLaptops && cpuLaptops.length > 0) {
          const { data: itemsByLaptop } = await supabase
            .from("transaction_items")
            .select("invoice_number")
            .in("laptop_id", cpuLaptops.map((l: any) => l.id));
          (itemsByLaptop ?? []).forEach((r: any) => { if (r.invoice_number) extraInvoiceNumbers.add(r.invoice_number); });
        }

        const orParts = [
          `invoice_number.ilike.%${term}%`,
          `customer_name.ilike.%${term}%`,
          `customer_phone.ilike.%${term}%`,
          `laptop_name.ilike.%${term}%`,
          `serial_number.ilike.%${term}%`,
        ];
        if (extraInvoiceNumbers.size > 0) {
          orParts.push(`invoice_number.in.(${Array.from(extraInvoiceNumbers).join(",")})`);
        }

        query = query.or(orParts.join(","));
      }
      if (customerType !== "ALL") {
        query = customerType === "UMUM"
          ? query.or("customer_type.eq.UMUM,customer_type.is.null")
          : query.eq("customer_type", customerType);
      }
      if (dateFrom) {
        const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
        query = query.gte("created_at", from.toISOString());
      }
      if (dateTo) {
        const to = new Date(dateTo); to.setHours(23, 59, 59, 999);
        query = query.lte("created_at", to.toISOString());
      }
      if (paymentMethod !== "ALL") query = query.eq("payment_method", paymentMethod);
      if (sourcePlatform !== "ALL") query = query.eq("source_platform", sourcePlatform);
      if (companyName !== "ALL") query = applyCompanyFilter(query, companyName);
      if (itemKind !== "ALL") query = query.eq("item_kind", itemKind);
    }

    // Baris yang nilainya NULL selalu ditaruh paling belakang, biar mirip perilaku sort Excel.
    query = query.order(sortColumn, { ascending, nullsFirst: false });

    // Harga jual: sebagian transaksi lama menyimpan nilainya di `amount`, bukan `deal_price`.
    // Jadi urutan kedua pakai `amount` supaya baris lama tidak menumpuk di ujung.
    if (sortColumn === "deal_price") {
      query = query.order("amount", { ascending, nullsFirst: false });
    }

    // Tie-breaker: kalau nilai kolom sama persis, urutannya tetap stabil antar halaman.
    if (sortColumn !== "created_at") {
      query = query.order("created_at", { ascending: false });
    }

    // Export & deep-link (invoiceExact) → ambil semua baris yang match, tanpa batas halaman.
    // Mode normal (buka halaman Riwayat Transaksi) → cuma ambil 1 halaman sesuai page/limit.
    if (!isExport && !invoiceExact.trim()) {
      const fromIdx = (page - 1) * limit;
      const toIdx = fromIdx + limit - 1;
      query = query.range(fromIdx, toIdx);
    }

    const { data: transactions, count, error } = await query;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ success: true, data: [], total: count ?? 0, page, limit });
    }

    // ── Kumpulkan semua invoice numbers & unit IDs (dari baris yang match saja) ──────
    const allInvoiceNumbers = transactions.map((t: any) => t.invoice_number);
    const allUnitIds = new Set<string>();
    const allLaptopIds = new Set<string>();

    for (const trx of transactions) {
      if (trx.unit_id) allUnitIds.add(trx.unit_id);
      if (Array.isArray(trx.unit_ids)) {
        for (const uid of trx.unit_ids) { if (uid) allUnitIds.add(uid); }
      }
      if (trx.laptop_id) allLaptopIds.add(trx.laptop_id);
    }

    // ── Fetch transaction_items — sumber deal_price & detail aksesori per item ──
    const { data: txItems, error: txItemsErr } = await supabase
      .from("transaction_items")
      .select("*")
      .in("invoice_number", allInvoiceNumbers);
    if (txItemsErr) console.error("[GET /api/transaction] txItems error:", txItemsErr.message);

    const txItemsMap = new Map<string, any[]>();
    const itemKindMap = new Map<string, { hasLaptop: boolean; hasAccessory: boolean }>();
    for (const item of txItems ?? []) {
      if (!txItemsMap.has(item.invoice_number)) txItemsMap.set(item.invoice_number, []);
      txItemsMap.get(item.invoice_number)!.push(item);
      if (item.unit_id) allUnitIds.add(item.unit_id);
      if (item.laptop_id) allLaptopIds.add(item.laptop_id);

      if (!itemKindMap.has(item.invoice_number)) itemKindMap.set(item.invoice_number, { hasLaptop: false, hasAccessory: false });
      const kindFlags = itemKindMap.get(item.invoice_number)!;
      if (item.item_type === "accessory") kindFlags.hasAccessory = true;
      else kindFlags.hasLaptop = true;
    }

    // ── Fetch accessory_outflows fallback — for when transaction_items has no accessory rows ──
    const outflowAccMap = new Map<string, Array<{ accessory_id: string; name: string; qty: number; buy_price: number }>>();
    {
      // Find invoices that are mixed/accessory but have no accessory rows in transaction_items
      const mixedInvoices = allInvoiceNumbers.filter(inv => {
        const txItemsForInv = txItemsMap.get(inv) ?? [];
        const hasAccInTxItems = txItemsForInv.some((it: any) => it.item_type === "accessory" || (Boolean(it.accessory_id) && !it.unit_id));
        return !hasAccInTxItems; // need fallback
      });

      if (mixedInvoices.length > 0) {
        const { data: outflows } = await supabase
          .from("accessory_outflows")
          .select("accessory_id, transaction_invoice, qty, status")
          .in("transaction_invoice", mixedInvoices)
          .eq("status", "active");

        if (outflows && outflows.length > 0) {
          const accIds = [...new Set(outflows.map((o: any) => o.accessory_id).filter(Boolean))];
          const { data: accData } = await supabase
            .from("accessories")
            .select("id, name, buy_price")
            .in("id", accIds);
          const accLookup = new Map((accData ?? []).map((a: any) => [a.id, a]));

          for (const o of outflows) {
            const inv = o.transaction_invoice;
            if (!outflowAccMap.has(inv)) outflowAccMap.set(inv, []);
            const acc = accLookup.get(o.accessory_id);
            outflowAccMap.get(inv)!.push({
              accessory_id: o.accessory_id,
              name: acc?.name || "Aksesori",
              qty: Number(o.qty) || 1,
              buy_price: Number(acc?.buy_price ?? 0),
            });
          }
        }
      }
    }

    // ── Fetch purchase_price dari laptop_units ───────────────────────────────
    const unitMap = new Map<string, {
      purchase_price: number;
      serial_number?: string;
      laptop_id?: string;
      selling_price?: number;
    }>();

    const allSerials = new Set<string>();
    for (const trx of transactions) {
      for (const sn of splitSerials(trx.serial_numbers)) allSerials.add(sn);
      for (const sn of splitSerials(trx.serial_number)) allSerials.add(sn);
    }

    const serialUnitMap = new Map<string, string>(); // serial_number -> unit_id

    if (allSerials.size > 0) {
      const { data: unitsBySN } = await supabase
        .from("laptop_units")
        .select("id, purchase_price, serial_number, laptop_id, selling_price")
        .in("serial_number", Array.from(allSerials));

      for (const u of unitsBySN ?? []) {
        if (!u.serial_number) continue;
        serialUnitMap.set(u.serial_number, u.id);
        allUnitIds.add(u.id);
        if (u.laptop_id) allLaptopIds.add(u.laptop_id);
        if (!unitMap.has(u.id)) {
          unitMap.set(u.id, {
            purchase_price: Number(u.purchase_price ?? 0), serial_number: u.serial_number,
            laptop_id: u.laptop_id ?? undefined,
            selling_price: Number(u.selling_price ?? 0),
          });
        }
      }
    }

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

    // ── Fetch laptop specs ───────────────────────────────────────────────────
    const laptopMap = new Map<string, { name?: string; cpu?: string; ram?: string; storage?: string; vga?: string }>();

    for (const [, unit] of unitMap) {
      if (unit.laptop_id) allLaptopIds.add(unit.laptop_id);
    }

    if (allLaptopIds.size > 0) {
      const { data: laptops } = await supabase
        .from("laptops")
        .select("id, laptop_name, cpu, ram, storage, gpu")
        .in("id", Array.from(allLaptopIds));

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

    const enriched = transactions.map((trx: any) => {
      const dealPrice = Number(trx.deal_price ?? trx.amount ?? 0);

      const unitIds: string[] =
        Array.isArray(trx.unit_ids) && trx.unit_ids.length > 0
          ? [...trx.unit_ids.filter(Boolean)]
          : trx.unit_id ? [trx.unit_id] : [];

      const resolvedIdSet = new Set(unitIds);
      const trxSerials = [...splitSerials(trx.serial_numbers), ...splitSerials(trx.serial_number)];
      for (const sn of trxSerials) {
        const uid = serialUnitMap.get(sn);
        if (uid && !resolvedIdSet.has(uid)) {
          resolvedIdSet.add(uid);
          unitIds.push(uid);
        }
      }

      const items = txItemsMap.get(trx.invoice_number) ?? [];

      const itemDealPriceMap = new Map<string, number>();
      for (const item of items) {
        if (item.unit_id) itemDealPriceMap.set(item.unit_id, Number(item.deal_price ?? 0));
      }

      const laptopGroups = new Map<string, {
        laptop_id: string;
        laptop_name: string;
        cpu?: string; ram?: string; storage?: string; vga?: string;
        serial_numbers: string[];
        purchase_price_total: number;
        selling_price_total: number;
        allocated_deal_price: number;
        unit_count: number;
        has_matched_unit: boolean; // unit ketemu di laptop_units, dipakai buat itung margin
      }>();

      let totalPurchasePrice = 0;
      let matchedAnyUnit = false;
      const allSerialNumbers: string[] = [];

      for (const uid of unitIds) {
        const unitData = unitMap.get(uid);
        if (!unitData) continue;

        matchedAnyUnit = true;
        totalPurchasePrice += unitData.purchase_price;
        if (unitData.serial_number) allSerialNumbers.push(unitData.serial_number);

        const laptopId = unitData.laptop_id ?? trx.laptop_id ?? "unknown";
        const specs = laptopMap.get(laptopId);

        const unitDealPrice = itemDealPriceMap.get(uid) ?? 0;

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
            allocated_deal_price: 0,
            unit_count: 0,
            has_matched_unit: false,
          });
        }

        const group = laptopGroups.get(laptopId)!;
        if (unitData.serial_number) group.serial_numbers.push(unitData.serial_number);
        group.purchase_price_total += unitData.purchase_price;
        group.selling_price_total += unitData.selling_price ?? 0;
        group.has_matched_unit = true;
        group.allocated_deal_price += unitDealPrice;
        group.unit_count += 1;
      }

      // ── Legacy: transaksi lama tanpa unit_ids ──────────────────────────────
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
          purchase_price_total: Number(trx.inventory_price ?? 0),
          selling_price_total: Number(trx.deal_price ?? trx.amount ?? 0),
          allocated_deal_price: dealPrice, // full deal price untuk legacy
          unit_count: 1,
          has_matched_unit: trx.inventory_price !== null && trx.inventory_price !== undefined,
        });
      }

      const grouped_items = Array.from(laptopGroups.values());

      const hasTxItems = items.length > 0;
      const totalAllocated = grouped_items.reduce((s, g) => s + g.allocated_deal_price, 0);

      const grouped_items_with_margin = grouped_items.map(g => {
        let finalDealPrice = g.allocated_deal_price;

        if (!hasTxItems || totalAllocated === 0) {
          const totalSelling = grouped_items.reduce((s, gi) => s + gi.selling_price_total, 0);
          if (totalSelling > 0) {
            finalDealPrice = Math.round(dealPrice * (g.selling_price_total / totalSelling));
          } else if (grouped_items.length > 0) {
            const totalUnits = grouped_items.reduce((s, gi) => s + gi.unit_count, 0);
            finalDealPrice = Math.round(dealPrice * (g.unit_count / Math.max(totalUnits, 1)));
          }
        }

        if (grouped_items.length === 1) {
          finalDealPrice = dealPrice;
        }

        const hasModal = g.has_matched_unit;
        const margin = hasModal ? finalDealPrice - g.purchase_price_total : 0;
        const modalMissing = g.purchase_price_total === 0; // modal 0 = belum di-set, apapun sumbernya
        return {
          ...g,
          allocated_deal_price: finalDealPrice,
          margin,
          has_modal: hasModal,
          modal_missing: modalMissing,
        };
      });
      const laptopSpecs = trx.laptop_id ? laptopMap.get(trx.laptop_id) : undefined;

      const storedInventoryPrice = Number(trx.inventory_price ?? 0);
      const finalInventoryPrice = matchedAnyUnit ? totalPurchasePrice : storedInventoryPrice;
      const hasModal = matchedAnyUnit || (trx.inventory_price !== null && trx.inventory_price !== undefined);
      const totalMargin = hasModal ? dealPrice - finalInventoryPrice : 0;
      const modalMissing = finalInventoryPrice === 0; // modal 0 = belum di-set, apapun sumbernya

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
        other: totalMargin,
        has_modal: hasModal,
        modal_missing: modalMissing,
        purchase_price_current: finalInventoryPrice,
        grouped_items: grouped_items_with_margin,
        accessory_items: (() => {
          // Try transaction_items first
          const fromTxItems = items
            .filter((it: any) => it.item_type === "accessory" || (Boolean(it.accessory_id) && !it.unit_id))
            .map((it: any) => ({
              accessory_id: it.accessory_id,
              name: it.item_name || it.laptop_name || "Aksesori",
              quantity: Number(it.quantity) || 1,
              deal_price: Number(it.deal_price ?? 0),
              selling_price: Number(it.selling_price ?? 0),
              is_bonus: Boolean(it.is_bonus || Number(it.deal_price) === 0),
            }));
          if (fromTxItems.length > 0) return fromTxItems;

          // Fallback to accessory_outflows
          const fromOutflows = outflowAccMap.get(trx.invoice_number) ?? [];
          return fromOutflows.map(o => ({
            accessory_id: o.accessory_id,
            name: o.name,
            quantity: o.qty,
            deal_price: 0,
            selling_price: o.buy_price,
            is_bonus: false,
          }));
        })(),
        is_multi_laptop: grouped_items.length > 1,
        item_kind: trx.item_kind ?? (() => {
          const flags = itemKindMap.get(trx.invoice_number);
          if (!flags) return unitIds.length > 0 ? "laptop" : "accessory";
          if (flags.hasAccessory && flags.hasLaptop) return "mixed";
          if (flags.hasAccessory) return "accessory";
          return "laptop";
        })(),
      };
    });

    return NextResponse.json({ success: true, data: enriched, total: count ?? enriched.length, page, limit });
  } catch (err) {
    console.error("[GET /api/transaction]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler);