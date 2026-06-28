import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";

interface Props {
  params: Promise<{ invoice: string }>;
}

async function setUnitStatus(sn: string, status: "SIAP_JUAL" | "TERJUAL") {
  const { error } = await supabase
    .from("laptop_units")
    .update({ status })
    .eq("serial_number", sn);
  if (error)
    console.error(
      `[setUnitStatus] gagal set ${status} untuk SN ${sn}:`,
      error.message
    );
}

async function syncUnitStatuses(oldSNs: string[], newSNs: string[]) {
  const oldSet = new Set(oldSNs);
  const newSet = new Set(newSNs);

  const toRelease = oldSNs.filter((sn) => sn && !newSet.has(sn));
  const toMark = newSNs.filter((sn) => sn && !oldSet.has(sn));

  await Promise.all([
    ...toRelease.map((sn) => setUnitStatus(sn, "SIAP_JUAL")),
    ...toMark.map((sn) => setUnitStatus(sn, "TERJUAL")),
  ]);
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

    // ── Enrich grouped_items dengan purchase_price TERKINI dari laptop_units ──
    // FIX: Selalu baca purchase_price dari laptop_units (bukan dari tx.inventory_price)
    // supaya perubahan modal yang disimpan via PUT langsung keliatan
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
        // Hitung total modal dari laptop_units (bukan dari tx.inventory_price)
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
            margin:
              Number(g.allocated_deal_price ?? 0) - purchase_price_total,
          };
        });

        // Jika grouped_items kosong tapi units ada (legacy tx tanpa grouped_items)
        if (enriched.length === 0 && units.length > 0) {
          return NextResponse.json({
            success: true,
            data: {
              ...tx,
              purchase_price_total: totalModalFromUnits,
              inventory_price: totalModalFromUnits,
              other:
                Number(tx.deal_price ?? tx.amount ?? 0) - totalModalFromUnits,
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
            grouped_items: enriched,
            // FIX: Gunakan total dari laptop_units, bukan tx.inventory_price
            purchase_price_total: enrichedTotal,
            inventory_price: enrichedTotal,
          },
        });
      }
    }

    // Fallback: return as-is
    return NextResponse.json({
      success: true,
      data: {
        ...tx,
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
    if (body.deal_price !== undefined)
      allowedFields.deal_price = Number(body.deal_price);
    if (body.payment_method !== undefined)
      allowedFields.payment_method = body.payment_method;
    if (body.customer_name !== undefined)
      allowedFields.customer_name = body.customer_name;
    if (body.customer_phone !== undefined)
      allowedFields.customer_phone = body.customer_phone;
    if (body.company_name !== undefined)
      allowedFields.company_name = body.company_name;
    if (body.laptop_name !== undefined)
      allowedFields.laptop_name = body.laptop_name;
    if (body.laptop_id !== undefined) allowedFields.laptop_id = body.laptop_id;
    if (body.serial_number !== undefined)
      allowedFields.serial_number = body.serial_number;
    if (body.unit_id !== undefined) allowedFields.unit_id = body.unit_id;
    if (body.unit_ids !== undefined) allowedFields.unit_ids = body.unit_ids;
    if (body.serial_numbers !== undefined)
      allowedFields.serial_numbers = body.serial_numbers;
    if (body.pickup_method !== undefined)
      allowedFields.pickup_method = body.pickup_method;
    if (body.pickup_date !== undefined)
      allowedFields.pickup_date = body.pickup_date;
    if (body.pickup_time !== undefined)
      allowedFields.pickup_time = body.pickup_time;
    if (body.pickup_location !== undefined)
      allowedFields.pickup_location = body.pickup_location;
    if (body.software_request !== undefined)
      allowedFields.software_request = body.software_request;
    if (body.source_platform !== undefined)
      allowedFields.source_platform = body.source_platform;
    if (body.status !== undefined) allowedFields.status = body.status;
    if (body.notes !== undefined) allowedFields.notes = body.notes;
    if (body.customer_type !== undefined)
      allowedFields.customer_type = body.customer_type;
    if (body.payment_method_2 !== undefined)
      allowedFields.payment_method_2 = body.payment_method_2;
    if (body.amount_method_1 !== undefined)
      allowedFields.amount_method_1 = Number(body.amount_method_1);
    if (body.amount_method_2 !== undefined)
      allowedFields.amount_method_2 = Number(body.amount_method_2);
    if (body.is_trade_in !== undefined)
      allowedFields.is_trade_in = Boolean(body.is_trade_in);
    if (body.trade_in_item !== undefined)
      allowedFields.trade_in_item = body.trade_in_item;
    if (body.trade_in_value !== undefined)
      allowedFields.trade_in_value = Number(body.trade_in_value);
    if (body.trade_in_cash !== undefined)
      allowedFields.trade_in_cash = Number(body.trade_in_cash);

    // ── FIX: Handle update purchase_price per unit ───────────────────
    // Bug lama: filter `> 0` bikin unit dengan modal 0 tidak diupdate
    // Fix: pakai `>= 0` dan validasi unit_id lebih ketat (non-empty string)
    type PurchasePriceUpdate = { unit_id: string; purchase_price: number };
    const purchasePricesPerUnit: PurchasePriceUpdate[] = Array.isArray(
      body.purchase_prices_per_unit
    )
      ? body.purchase_prices_per_unit
      : [];

    let newInventoryPrice: number | null = null;

    if (purchasePricesPerUnit.length > 0) {
      // FIX: Validasi unit_id harus string non-empty (bukan "" atau null)
      // Dan purchase_price >= 0 (bukan > 0) supaya nilai 0 tetap disimpan
      const validUpdates = purchasePricesPerUnit.filter(
        (p) =>
          typeof p.unit_id === "string" &&
          p.unit_id.trim().length > 0 &&
          Number.isFinite(Number(p.purchase_price)) &&
          Number(p.purchase_price) >= 0  // FIX: >= 0, bukan > 0
      );

      if (validUpdates.length > 0) {
        // FIX: Update purchase_price di laptop_units — ini yang bikin halaman Sold ikut update
        const updateResults = await Promise.allSettled(
          validUpdates.map((p) =>
            supabase
              .from("laptop_units")
              .update({ purchase_price: Math.round(Number(p.purchase_price)) })
              .eq("id", p.unit_id)
          )
        );

        // Log jika ada yang gagal (debugging)
        updateResults.forEach((result, i) => {
          if (result.status === "rejected") {
            console.error(
              `[PUT transaction] Gagal update purchase_price unit ${validUpdates[i].unit_id}:`,
              result.reason
            );
          }
        });
      }

      // Hitung total inventory_price baru dari SEMUA entry yang dikirim
      // (termasuk yang unit_id-nya kosong / legacy, supaya totalnya akurat)
      newInventoryPrice = purchasePricesPerUnit.reduce(
        (sum, p) => sum + Math.round(Number(p.purchase_price) || 0),
        0
      );
    }

    // ── Hitung field other (profit) ──────────────────────────────────
    const dealPrice =
      body.deal_price ?? body.amount ?? before?.deal_price ?? before?.amount ?? 0;
    const inventoryPrice =
      newInventoryPrice !== null
        ? newInventoryPrice
        : before?.inventory_price ?? 0;

    allowedFields.other = Number(dealPrice) - Number(inventoryPrice);

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

    // ── Sync status unit jika serial_numbers berubah ─────────────────
    if (body.serial_numbers !== undefined) {
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