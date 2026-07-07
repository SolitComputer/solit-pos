import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";

interface Props {
  params: Promise<{ invoice: string }>;
}

// ── Helper: set status unit by ID (primary) ──────────────────────────────────
// Mengembalikan boolean supaya kegagalan write TIDAK ditelan diam-diam.
async function setUnitStatusById(
  unitId: string,
  status: "SIAP_JUAL" | "TERJUAL"
): Promise<boolean> {
  const { error } = await supabase
    .from("laptop_units")
    .update({ status })
    .eq("id", unitId);

  if (error) {
    console.error(`[setUnitStatusById] gagal set ${status} untuk ID ${unitId}:`, error.message);
    return false;
  }
  return true;
}

// ── Helper: set status unit by SN (fallback legacy) ──────────────────────────
async function setUnitStatus(sn: string, status: "SIAP_JUAL" | "TERJUAL") {
  const { error } = await supabase
    .from("laptop_units")
    .update({ status })
    .eq("serial_number", sn);

  if (error) {
    console.error(`[setUnitStatus] gagal set ${status} untuk SN ${sn}:`, error.message);
  }
}

// ── Helper: recalculate qty & status laptop parent ────────────────────────────
async function syncLaptopParentStats(laptopIds: string[]) {
  if (laptopIds.length === 0) return;

  for (const laptopId of laptopIds) {
    const { data: siapUnits } = await supabase
      .from("laptop_units")
      .select("id")
      .eq("laptop_id", laptopId)
      .eq("status", "SIAP_JUAL");

    const newQty = siapUnits?.length ?? 0;

    await supabase
      .from("laptops")
      .update({
        qty: newQty,
        status: newQty > 0 ? "SIAP_JUAL" : "SOLD",
      })
      .eq("id", laptopId);

    console.log(`[syncLaptopParentStats] laptop ${laptopId} → qty=${newQty}, status=${newQty > 0 ? "SIAP_JUAL" : "SOLD"}`);
  }
}

// ── Helper: resolusi laptop_units.id dari campuran unit_id + serial_number ─────
// Kalau ada unit_id kosong/hilang (kasus umum saat "Tukar SN"), di-backfill dari
// serial_number supaya unit tidak "hilang" dari diff status.
async function resolveUnitIds(
  ids: (string | null | undefined)[],
  sns: (string | null | undefined)[]
): Promise<string[]> {
  const resolved = new Set<string>();

  for (const id of ids) {
    const clean = (id ?? "").toString().trim();
    if (clean) resolved.add(clean);
  }

  const cleanSNs = [
    ...new Set(
      sns.map((s) => (s ?? "").toString().trim()).filter((s) => s.length > 0)
    ),
  ];

  if (cleanSNs.length > 0) {
    const { data: unitsBySN, error } = await supabase
      .from("laptop_units")
      .select("id, serial_number")
      .in("serial_number", cleanSNs);

    if (error) console.error("[resolveUnitIds] gagal lookup SN → id:", error.message);
    for (const u of unitsBySN ?? []) {
      if (u.id) resolved.add(u.id);
    }
  }

  return [...resolved];
}

// ── Sync by unit_ids (modern — primary path) ──────────────────────────────────
// Dipanggil saat form kirim unit_ids (array UUID).
// FIX bug "Tukar SN": backfill id dari serial_number, jadi unit baru yang unit_id-nya
// sempat kosong tetap ke-resolve dan ditandai TERJUAL.
async function syncUnitStatusesByIds(
  oldIds: string[],
  newIds: string[],
  oldSNs: string[] = [],
  newSNs: string[] = []
) {
  const cleanOld = await resolveUnitIds(oldIds, oldSNs);
  const cleanNew = await resolveUnitIds(newIds, newSNs);

  const oldSet = new Set(cleanOld);
  const newSet = new Set(cleanNew);

  // Unit lama yang tidak ada di list baru → kembalikan ke stok
  const toRelease = cleanOld.filter((id) => !newSet.has(id));
  // Unit baru yang tidak ada di list lama → tandai terjual
  const toMark = cleanNew.filter((id) => !oldSet.has(id));

  if (toRelease.length === 0 && toMark.length === 0) {
    console.log("[syncUnitStatusesByIds] Tidak ada perubahan unit, skip sync.");
    return;
  }

  console.log("[syncUnitStatusesByIds] toRelease:", toRelease, "toMark:", toMark);

  // Update status di laptop_units — sekarang track hasil sukses/gagalnya
  const results = await Promise.all([
    ...toRelease.map((id) => setUnitStatusById(id, "SIAP_JUAL")),
    ...toMark.map((id) => setUnitStatusById(id, "TERJUAL")),
  ]);

  const failed = results.filter((ok) => !ok).length;
  if (failed > 0) {
    console.error(`[syncUnitStatusesByIds] ${failed} update status unit GAGAL — cek RLS/constraint.`);
  }

  // Kumpulkan semua laptop_id yang terdampak untuk recalculate parent
  const affectedUnitIds = [...toRelease, ...toMark];
  const { data: affectedUnits } = await supabase
    .from("laptop_units")
    .select("laptop_id")
    .in("id", affectedUnitIds);

  const affectedLaptopIds = [
    ...new Set(
      (affectedUnits ?? [])
        .map((u: { laptop_id: string }) => u.laptop_id)
        .filter(Boolean)
    ),
  ];

  // Recalculate qty & status laptop parent
  await syncLaptopParentStats(affectedLaptopIds);
}

// ── Sync by serial_numbers (legacy fallback) ──────────────────────────────────
// Dipanggil hanya untuk transaksi lama yang tidak punya unit_ids
async function syncUnitStatuses(oldSNs: string[], newSNs: string[]) {
  const oldSet = new Set(oldSNs);
  const newSet = new Set(newSNs);

  const toRelease = oldSNs.filter((sn) => sn && !newSet.has(sn));
  const toMark = newSNs.filter((sn) => sn && !oldSet.has(sn));

  if (toRelease.length === 0 && toMark.length === 0) return;

  console.log("[syncUnitStatuses] toRelease:", toRelease, "toMark:", toMark);

  await Promise.all([
    ...toRelease.map((sn) => setUnitStatus(sn, "SIAP_JUAL")),
    ...toMark.map((sn) => setUnitStatus(sn, "TERJUAL")),
  ]);

  // Ambil laptop_id dari SN yang terdampak lalu recalculate parent
  const allSNs = [...toRelease, ...toMark];
  const { data: affectedUnits } = await supabase
    .from("laptop_units")
    .select("laptop_id")
    .in("serial_number", allSNs);

  const affectedLaptopIds = [
    ...new Set(
      (affectedUnits ?? [])
        .map((u: { laptop_id: string }) => u.laptop_id)
        .filter(Boolean)
    ),
  ];

  await syncLaptopParentStats(affectedLaptopIds);
}

// ── GET /api/transaction/[invoice] ───────────────────────────────────────────
async function getHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { invoice } = await props.params;

    const { data: tx, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("invoice_number", invoice)
      .single();

    if (error || !tx) {
      return NextResponse.json(
        { success: false, message: error?.message ?? "Not found" },
        { status: 404 }
      );
    }

    const { data: txItems } = await supabase
      .from("transaction_items")
      .select("unit_id, serial_number, deal_price")
      .eq("invoice_number", invoice);
    const itemsPayload = txItems ?? [];

    const unitIds: string[] = Array.isArray(tx.unit_ids)
      ? tx.unit_ids.filter(Boolean)
      : tx.unit_id
        ? [tx.unit_id]
        : [];

    if (unitIds.length > 0) {
      const { data: units } = await supabase
        .from("laptop_units")
        .select(
          "id, serial_number, purchase_price, laptop_id, laptop:laptops(laptop_name, cpu, ram, storage)"
        )
        .in("id", unitIds);

      if (units && units.length > 0) {
        const totalModalFromUnits = units.reduce(
          (sum: number, u: any) => sum + Number(u.purchase_price ?? 0),
          0
        );

        const enriched = (tx.grouped_items ?? []).map((g: any) => {
          const matchingUnits = units.filter((u: any) => {
            const snsInGroup: string[] = Array.isArray(g.serial_numbers)
              ? g.serial_numbers
              : [];
            return (
              snsInGroup.includes(u.serial_number) ||
              (u.laptop as any)?.laptop_name === g.laptop_name
            );
          });

          const purchase_price_total = matchingUnits.reduce(
            (sum: number, u: any) => sum + Number(u.purchase_price ?? 0),
            0
          );

          return {
            ...g,
            purchase_price_total,
            margin: Number(g.allocated_deal_price ?? 0) - purchase_price_total,
          };
        });

        if (enriched.length === 0 && units.length > 0) {
          return NextResponse.json({
            success: true,
            data: {
              ...tx,
              transaction_items: itemsPayload,
              purchase_price_total: totalModalFromUnits,
              inventory_price: totalModalFromUnits,
              other: Number(tx.deal_price ?? tx.amount ?? 0) - totalModalFromUnits,
            },
          });
        }

        const enrichedTotal = enriched.reduce(
          (s: number, g: any) => s + Number(g.purchase_price_total ?? 0),
          0
        );

        return NextResponse.json({
          success: true,
          data: {
            ...tx,
            transaction_items: itemsPayload,
            grouped_items: enriched,
            purchase_price_total: enrichedTotal,
            inventory_price: enrichedTotal,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...tx,
        transaction_items: itemsPayload,
        purchase_price_total: Number(tx.inventory_price ?? 0),
      },
    });
  } catch (error) {
    console.error("[GET /api/transaction/[invoice]]", error);
    return NextResponse.json(
      { success: false, message: String(error) },
      { status: 500 }
    );
  }
}

// ── PUT /api/transaction/[invoice] ───────────────────────────────────────────
async function putHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { invoice } = await props.params;
    const body = await req.json();

    // ── Ambil data sebelum diubah ────────────────────────────────────
    const { data: before } = await supabase
      .from("transactions")
      .select("*")
      .eq("invoice_number", invoice)
      .single();

    // ── Whitelist field yang boleh diupdate ──────────────────────────
    const allowedFields: Record<string, any> = {};
    if (body.amount !== undefined) allowedFields.amount = Number(body.amount);
    if (body.deal_price !== undefined) allowedFields.deal_price = Number(body.deal_price);
    if (body.payment_method !== undefined) allowedFields.payment_method = body.payment_method;
    if (body.customer_name !== undefined) allowedFields.customer_name = body.customer_name;
    if (body.customer_phone !== undefined) allowedFields.customer_phone = body.customer_phone;
    if (body.company_name !== undefined) allowedFields.company_name = body.company_name;
    if (body.laptop_name !== undefined) allowedFields.laptop_name = body.laptop_name;
    if (body.laptop_id !== undefined) allowedFields.laptop_id = body.laptop_id;
    if (body.serial_number !== undefined) allowedFields.serial_number = body.serial_number;
    if (body.unit_id !== undefined) allowedFields.unit_id = body.unit_id;
    if (body.unit_ids !== undefined) allowedFields.unit_ids = body.unit_ids;
    if (body.serial_numbers !== undefined) allowedFields.serial_numbers = body.serial_numbers;
    if (body.pickup_method !== undefined) allowedFields.pickup_method = body.pickup_method;
    if (body.pickup_date !== undefined) allowedFields.pickup_date = body.pickup_date;
    if (body.pickup_time !== undefined) allowedFields.pickup_time = body.pickup_time;
    if (body.pickup_location !== undefined) allowedFields.pickup_location = body.pickup_location;
    if (body.software_request !== undefined) allowedFields.software_request = body.software_request;
    if (body.source_platform !== undefined) allowedFields.source_platform = body.source_platform;
    if (body.status !== undefined) allowedFields.status = body.status;
    if (body.notes !== undefined) allowedFields.notes = body.notes;
    if (body.customer_type !== undefined) allowedFields.customer_type = body.customer_type;
    if (body.payment_method_2 !== undefined) allowedFields.payment_method_2 = body.payment_method_2;
    if (body.amount_method_1 !== undefined) allowedFields.amount_method_1 = Number(body.amount_method_1);
    if (body.amount_method_2 !== undefined) allowedFields.amount_method_2 = Number(body.amount_method_2);
    if (body.is_trade_in !== undefined) allowedFields.is_trade_in = Boolean(body.is_trade_in);
    if (body.trade_in_item !== undefined) allowedFields.trade_in_item = body.trade_in_item;
    if (body.trade_in_value !== undefined) allowedFields.trade_in_value = Number(body.trade_in_value);
    if (body.trade_in_cash !== undefined) allowedFields.trade_in_cash = Number(body.trade_in_cash);
    if (body.price_per_unit !== undefined) allowedFields.price_per_unit = Number(body.price_per_unit);

    // ── Handle update purchase_price per unit ────────────────────────
    type PurchasePriceUpdate = { unit_id: string; purchase_price: number };
    const purchasePricesPerUnit: PurchasePriceUpdate[] = Array.isArray(body.purchase_prices_per_unit)
      ? body.purchase_prices_per_unit
      : [];

    let newInventoryPrice: number | null = null;

    if (purchasePricesPerUnit.length > 0) {
      const validUpdates = purchasePricesPerUnit.filter(
        (p) =>
          typeof p.unit_id === "string" &&
          p.unit_id.trim().length > 0 &&
          Number.isFinite(Number(p.purchase_price)) &&
          Number(p.purchase_price) >= 0
      );

      if (validUpdates.length > 0) {
        const updateResults = await Promise.allSettled(
          validUpdates.map((p) =>
            supabase
              .from("laptop_units")
              .update({ purchase_price: Math.round(Number(p.purchase_price)) })
              .eq("id", p.unit_id)
          )
        );

        updateResults.forEach((result, i) => {
          if (result.status === "rejected") {
            console.error(
              `[PUT transaction] Gagal update purchase_price unit ${validUpdates[i].unit_id}:`,
              result.reason
            );
          }
        });
      }

      newInventoryPrice = purchasePricesPerUnit.reduce(
        (sum, p) => sum + Math.round(Number(p.purchase_price) || 0),
        0
      );
    }

    // ── Handle update deal_price per unit di transaction_items ────────
    type DealPriceUpdate = { unit_id?: string; serial_number?: string; deal_price: number };
    const dealPricesPerUnit: DealPriceUpdate[] = Array.isArray(body.deal_prices_per_unit)
      ? body.deal_prices_per_unit
      : [];

    let newDealTotal: number | null = null;

    if (dealPricesPerUnit.length > 0) {
      const validDeal = dealPricesPerUnit.filter(
        (p) => Number.isFinite(Number(p.deal_price)) && Number(p.deal_price) >= 0
      );

      await Promise.allSettled(
        validDeal.map((p) => {
          const base = supabase
            .from("transaction_items")
            .update({ deal_price: Math.round(Number(p.deal_price)) })
            .eq("invoice_number", invoice);
          return p.unit_id && String(p.unit_id).trim().length > 0
            ? base.eq("unit_id", p.unit_id)
            : base.eq("serial_number", p.serial_number ?? "");
        })
      );

      newDealTotal = dealPricesPerUnit.reduce(
        (s, p) => s + Math.round(Number(p.deal_price) || 0),
        0
      );
    }

    // ── Hitung field other (profit) ──────────────────────────────────
    const dealPrice =
      newDealTotal !== null
        ? newDealTotal
        : (body.deal_price ?? body.amount ?? before?.deal_price ?? before?.amount ?? 0);
    const inventoryPrice =
      newInventoryPrice !== null
        ? newInventoryPrice
        : before?.inventory_price ?? 0;

    allowedFields.other = Number(dealPrice) - Number(inventoryPrice);

    if (newDealTotal !== null) {
      allowedFields.deal_price = newDealTotal;
      allowedFields.amount = newDealTotal;
    }

    if (newInventoryPrice !== null) {
      allowedFields.inventory_price = newInventoryPrice;
    }

    allowedFields.last_edited_by = user.name;
    allowedFields.last_edited_at = new Date().toISOString();

    // ── Update tabel transactions ────────────────────────────────────
    const { data, error } = await supabase
      .from("transactions")
      .update(allowedFields)
      .eq("invoice_number", invoice)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    // ── Sync status unit ─────────────────────────────────────────────
    // PRIORITAS 1: by unit_ids (modern, reliable, selalu ada dari form edit)
    if (body.unit_ids !== undefined) {
      const oldIds: string[] = Array.isArray(before?.unit_ids)
        ? before.unit_ids.filter(Boolean)
        : before?.unit_id
          ? [before.unit_id]
          : [];

      const newIds: string[] = Array.isArray(body.unit_ids)
        ? body.unit_ids.filter(Boolean)
        : body.unit_id
          ? [body.unit_id]
          : [];

      // FIX: sertakan serial_numbers sebagai fallback resolusi unit_id.
      // Ini yang bikin "Tukar SN" benar walau unit_id unit baru sempat kosong.
      const oldSNs: string[] = Array.isArray(before?.serial_numbers)
        ? before.serial_numbers.filter(Boolean)
        : before?.serial_number
          ? [before.serial_number]
          : [];

      const newSNs: string[] = Array.isArray(body.serial_numbers)
        ? body.serial_numbers.filter(Boolean)
        : body.serial_number
          ? [body.serial_number]
          : [];

      await syncUnitStatusesByIds(oldIds, newIds, oldSNs, newSNs);
    }
    // PRIORITAS 2: fallback by serial_numbers (untuk transaksi legacy lama)
    else if (body.serial_numbers !== undefined) {
      const oldSNs: string[] = Array.isArray(before?.serial_numbers)
        ? before.serial_numbers.filter(Boolean)
        : before?.serial_number
          ? [before.serial_number]
          : [];

      const newSNs: string[] = Array.isArray(body.serial_numbers)
        ? body.serial_numbers.filter(Boolean)
        : body.serial_number
          ? [body.serial_number]
          : [];

      await syncUnitStatuses(oldSNs, newSNs);
    }

    // ── Activity log ─────────────────────────────────────────────────
    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "EDIT",
      entity: "transaction",
      entityId: before?.id,
      entityLabel: `${invoice} — ${before?.customer_name ?? "—"}`,
      beforeData: before,
      afterData: data,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[PUT /api/transaction/[invoice]]", error);
    return NextResponse.json(
      { success: false, message: String(error) },
      { status: 500 }
    );
  }
}

export const GET = withAuth(
  getHandler,
  PERMISSIONS.EDIT_TRANSACTION.concat(["ACCOUNTING"])
);
export const PUT = withAuth(putHandler, PERMISSIONS.EDIT_TRANSACTION);