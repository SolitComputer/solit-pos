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
        ...(serial_number !== undefined && { serial_number }),
        ...(grade !== undefined && { grade }),
        ...(condition_note !== undefined && { condition_note }),
        ...(purchase_price !== undefined && { purchase_price: Math.round(Number(purchase_price)) }),
        ...(selling_price !== undefined && { selling_price: Math.round(Number(selling_price)) }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
        ...(body.received_at !== undefined && body.received_at !== "" && {
          created_at: body.received_at
        }),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "EDIT",
      entity: "unit",
      entityId: id,
      entityLabel: `SN: ${before?.serial_number ?? serial_number ?? id}`,
      beforeData: before,
      afterData: data,
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

// ── PATCH: Koreksi harga modal unit SOLD ─────────────────────────────────────
// Kenapa PATCH terpisah dari PUT:
// - PUT butuh PERMISSIONS.EDIT_LAPTOP (hak akses lebih tinggi)
// - PATCH harga modal cukup PERMISSIONS.EDIT_TRANSACTION supaya
//   role yang bisa edit transaksi bisa koreksi modal tanpa bisa ubah SN/grade/dll
// - PATCH juga otomatis sync transactions.inventory_price & transactions.other
//   supaya margin di riwayat transaksi & dashboard gross profit ikut berubah
async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id: unitId } = await props.params;
    const body = await req.json();

    // Validasi: endpoint ini khusus update purchase_price
    if (body.purchase_price === undefined) {
      return NextResponse.json(
        { success: false, message: "purchase_price wajib diisi" },
        { status: 400 }
      );
    }

    const newPrice = Math.round(Number(body.purchase_price));
    if (!Number.isFinite(newPrice) || newPrice < 0) {
      return NextResponse.json(
        { success: false, message: "purchase_price tidak valid" },
        { status: 400 }
      );
    }

    // Ambil data unit sebelum diubah (untuk log & validasi)
    const { data: before, error: fetchError } = await supabase
      .from("laptop_units")
      .select("id, serial_number, purchase_price, laptop_id, status")
      .eq("id", unitId)
      .single();

    if (fetchError || !before) {
      return NextResponse.json(
        { success: false, message: "Unit tidak ditemukan" },
        { status: 404 }
      );
    }

    // ── 1. Update purchase_price di laptop_units ──────────────────────────────
    // laptop_units adalah sumber kebenaran tunggal untuk harga modal.
    // GET /api/transaction/[invoice] dan GET /api/transaction sudah
    // baca purchase_price dari sini secara live.
    const { data: updated, error: updateError } = await supabase
      .from("laptop_units")
      .update({ purchase_price: newPrice })
      .eq("id", unitId)
      .select()
      .single();

    if (updateError) throw updateError;

    // ── 2. Sync transactions.inventory_price & transactions.other ─────────────
    // Kenapa perlu sync ke transactions:
    // /api/dashboard/gross-profit-detail membaca inventory_price dari kolom
    // transactions.inventory_price (bukan live dari laptop_units) untuk
    // efisiensi query. Jadi kita harus update kolom itu juga.
    //
    // Supabase array contains: unit_ids.cs.{unitId}
    const { data: txList } = await supabase
      .from("transactions")
      .select("invoice_number, unit_id, unit_ids, deal_price, amount")
      .or(`unit_id.eq.${unitId},unit_ids.cs.{${unitId}}`);

    if (txList && txList.length > 0) {
      await Promise.allSettled(
        txList.map(async (tx) => {
          // Kumpulkan semua unit_id dalam transaksi ini
          const unitIds: string[] =
            Array.isArray(tx.unit_ids) && tx.unit_ids.length > 0
              ? tx.unit_ids.filter(Boolean)
              : tx.unit_id
                ? [tx.unit_id]
                : [];

          if (unitIds.length === 0) return;

          // Ambil purchase_price TERBARU semua unit dalam transaksi ini.
          // Karena kita sudah update di step 1, nilai unitId sudah = newPrice.
          const { data: allUnits } = await supabase
            .from("laptop_units")
            .select("id, purchase_price")
            .in("id", unitIds);

          if (!allUnits || allUnits.length === 0) return;

          const newInventoryPrice = allUnits.reduce(
            (sum, u) => sum + Math.round(Number(u.purchase_price ?? 0)),
            0
          );

          const dealPrice = Number(tx.deal_price ?? tx.amount ?? 0);
          // other = gross profit per transaksi (deal_price - total modal)
          const newOther = dealPrice - newInventoryPrice;

          await supabase
            .from("transactions")
            .update({
              inventory_price: newInventoryPrice,
              other: newOther,
              last_edited_by: user.name,
              last_edited_at: new Date().toISOString(),
            })
            .eq("invoice_number", tx.invoice_number);
        })
      );
    }

    // ── 3. Activity log ───────────────────────────────────────────────────────
    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "EDIT",
      entity: "unit",
      entityId: unitId,
      entityLabel: `SN: ${before.serial_number} — koreksi harga modal`,
      beforeData: { purchase_price: before.purchase_price },
      afterData: { purchase_price: newPrice },
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
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "DELETE",
      entity: "unit",
      entityId: id,
      entityLabel: `SN: ${unit?.serial_number ?? id}`,
      beforeData: unit,
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

export const PUT = withAuth(putHandler, PERMISSIONS.EDIT_LAPTOP);
export const PATCH = withAuth(patchHandler, PERMISSIONS.EDIT_TRANSACTION);
export const DELETE = withAuth(deleteHandler, PERMISSIONS.EDIT_LAPTOP);