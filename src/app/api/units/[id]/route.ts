import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";

interface Props {
  params: Promise<{ id: string }>;
}

// ── PUT: Update unit (serial number, grade, harga, dll) ──────────────────────
async function putHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const body = await req.json();

    const {
      serial_number, grade, condition_note,
      purchase_price, selling_price, status, notes,
    } = body;

    // Cek duplicate SN
    if (serial_number) {
      const { data: existing } = await supabase
        .from("laptop_units")
        .select("id")
        .eq("serial_number", serial_number)
        .neq("id", id)
        .single();

      if (existing) {
        return NextResponse.json(
          { success: false, message: `Serial number "${serial_number}" sudah dipakai` },
          { status: 409 }
        );
      }
    }

    // Ambil data sebelum diubah
    const { data: before } = await supabase
      .from("laptop_units")
      .select("*")
      .eq("id", id)
      .single();

    const { data, error } = await supabase
      .from("laptop_units")
      .update({
        ...(serial_number    !== undefined && { serial_number }),
        ...(grade            !== undefined && { grade }),
        ...(condition_note   !== undefined && { condition_note }),
        ...(purchase_price   !== undefined && { purchase_price:  Math.round(Number(purchase_price)) }),
        ...(selling_price    !== undefined && { selling_price:   Math.round(Number(selling_price)) }),
        ...(body.sparepart_cost !== undefined && { sparepart_cost: Math.round(Number(body.sparepart_cost)) }),
        ...(status           !== undefined && { status }),
        ...(notes            !== undefined && { notes }),
        ...(body.received_at !== undefined && body.received_at !== "" && {
          created_at: body.received_at,
        }),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await logActivity({
      userId:      user.id,
      userName:    user.name,
      userRole:    user.role,
      action:      "EDIT",
      entity:      "unit",
      entityId:    id,
      entityLabel: `SN: ${before?.serial_number ?? serial_number ?? id}`,
      beforeData:  before,
      afterData:   data,
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Gagal update unit" },
      { status: 500 }
    );
  }
}

// ── PATCH: Koreksi harga modal ATAU harga sparepart ───────────────────────────
//
// Kenapa PATCH terpisah dari PUT:
//   - PUT butuh PERMISSIONS.EDIT_UNITS (ubah SN/grade/dll)
//   - PATCH dipakai untuk inline-edit harga di tabel, scope lebih spesifik
//   - PATCH purchase_price juga sync ke transactions.inventory_price & .other
//     agar gross profit dashboard tetap akurat
//
// Field yang didukung (salah satu wajib ada):
//   - purchase_price  → Path A: update modal + sync transaksi
//   - sparepart_cost  → Path B: update sparepart saja (no tx sync needed)
//
async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id: unitId } = await props.params;
    const body = await req.json();

    const isPurchasePrice = body.purchase_price !== undefined;
    const isSparepartCost = body.sparepart_cost !== undefined;

    if (!isPurchasePrice && !isSparepartCost) {
      return NextResponse.json(
        { success: false, message: "purchase_price atau sparepart_cost wajib diisi" },
        { status: 400 }
      );
    }

    // Ambil data unit sebelum diubah (untuk log & validasi)
    const { data: before, error: fetchError } = await supabase
      .from("laptop_units")
      .select("id, serial_number, purchase_price, sparepart_cost, laptop_id, status")
      .eq("id", unitId)
      .single();

    if (fetchError || !before) {
      return NextResponse.json(
        { success: false, message: "Unit tidak ditemukan" },
        { status: 404 }
      );
    }

    // ── Path A: update purchase_price ─────────────────────────────────────────
    if (isPurchasePrice) {
      const newPrice = Math.round(Number(body.purchase_price));
      if (!Number.isFinite(newPrice) || newPrice < 0) {
        return NextResponse.json(
          { success: false, message: "purchase_price tidak valid" },
          { status: 400 }
        );
      }

      const { data: updated, error: updateError } = await supabase
        .from("laptop_units")
        .update({ purchase_price: newPrice })
        .eq("id", unitId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Sync transactions.inventory_price & transactions.other
      // Diperlukan agar gross profit di dashboard tetap akurat setelah koreksi modal
      const { data: txList } = await supabase
        .from("transactions")
        .select("invoice_number, unit_id, unit_ids, deal_price, amount")
        .or(`unit_id.eq.${unitId},unit_ids.cs.{${unitId}}`);

      if (txList && txList.length > 0) {
        await Promise.allSettled(
          txList.map(async tx => {
            const unitIds: string[] =
              Array.isArray(tx.unit_ids) && tx.unit_ids.length > 0
                ? tx.unit_ids.filter(Boolean)
                : tx.unit_id ? [tx.unit_id] : [];

            if (unitIds.length === 0) return;

            const { data: allUnits } = await supabase
              .from("laptop_units")
              .select("id, purchase_price")
              .in("id", unitIds);

            if (!allUnits || allUnits.length === 0) return;

            const newInventoryPrice = allUnits.reduce(
              (sum, u) => sum + Math.round(Number(u.purchase_price ?? 0)), 0
            );
            const dealPrice = Number(tx.deal_price ?? tx.amount ?? 0);
            const newOther  = dealPrice - newInventoryPrice;

            await supabase
              .from("transactions")
              .update({
                inventory_price: newInventoryPrice,
                other:           newOther,
                last_edited_by:  user.name,
                last_edited_at:  new Date().toISOString(),
              })
              .eq("invoice_number", tx.invoice_number);
          })
        );
      }

      await logActivity({
        userId:      user.id,
        userName:    user.name,
        userRole:    user.role,
        action:      "EDIT",
        entity:      "unit",
        entityId:    unitId,
        entityLabel: `SN: ${before.serial_number} — koreksi harga modal`,
        beforeData:  { purchase_price: before.purchase_price },
        afterData:   { purchase_price: newPrice },
      });

      return NextResponse.json({ success: true, data: updated });
    }

    // ── Path B: update sparepart_cost ─────────────────────────────────────────
    // Tidak perlu sync ke transactions karena sparepart_cost tidak disimpan
    // di tabel transactions (beda dengan purchase_price/inventory_price).
    const newSparepart = Math.round(Number(body.sparepart_cost));
    if (!Number.isFinite(newSparepart) || newSparepart < 0) {
      return NextResponse.json(
        { success: false, message: "sparepart_cost tidak valid" },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("laptop_units")
      .update({ sparepart_cost: newSparepart })
      .eq("id", unitId)
      .select()
      .single();

    if (updateError) throw updateError;

    await logActivity({
      userId:      user.id,
      userName:    user.name,
      userRole:    user.role,
      action:      "EDIT",
      entity:      "unit",
      entityId:    unitId,
      entityLabel: `SN: ${before.serial_number} — koreksi harga sparepart`,
      beforeData:  { sparepart_cost: before.sparepart_cost },
      afterData:   { sparepart_cost: newSparepart },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error("[PATCH /api/units/[id]]", err);
    return NextResponse.json(
      { success: false, message: String(err) },
      { status: 500 }
    );
  }
}

// ── DELETE: Hapus unit ────────────────────────────────────────────────────────
async function deleteHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    const { data: unit } = await supabase
      .from("laptop_units")
      .select("*")
      .eq("id", id)
      .single();

    const { error } = await supabase
      .from("laptop_units")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await logActivity({
      userId:      user.id,
      userName:    user.name,
      userRole:    user.role,
      action:      "DELETE",
      entity:      "unit",
      entityId:    id,
      entityLabel: `SN: ${unit?.serial_number ?? id}`,
      beforeData:  unit,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Gagal hapus unit" },
      { status: 500 }
    );
  }
}

export const PUT    = withAuth(putHandler,    PERMISSIONS.EDIT_UNITS);
export const PATCH  = withAuth(patchHandler,  PERMISSIONS.EDIT_UNITS);
export const DELETE = withAuth(deleteHandler, PERMISSIONS.EDIT_UNITS);