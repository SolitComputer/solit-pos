import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { LAPTOP_DELETE_ROLES } from "@/lib/permissions";


interface Props {
  params: Promise<{ id: string }>;
}

async function getHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    const { data, error } = await supabase
      .from("laptops")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

async function putHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const body = await req.json();

    // Ambil data sebelum diubah untuk before_data
    const { data: before } = await supabase
      .from("laptops")
      .select("*")
      .eq("id", id)
      .single();

    // Hanya update kolom yang benar-benar dikirim, supaya PUT parsial tidak
    // menimpa field lain jadi null / NaN (mis. selling_price = Math.round(NaN)).
    const updatePayload: Record<string, unknown> = {};
    const FIELDS = [
      "laptop_name", "brand", "cpu", "ram", "storage",
      "gpu", "display", "condition_note", "notes",
    ] as const;
    for (const f of FIELDS) {
      if (body[f] !== undefined) updatePayload[f] = body[f];
    }
    if (body.selling_price !== undefined && body.selling_price !== null) {
      const price = Math.round(Number(body.selling_price));
      if (!Number.isFinite(price)) {
        return NextResponse.json(
          { success: false, message: "Harga jual tidak valid" },
          { status: 400 }
        );
      }
      updatePayload.selling_price = price;
    }
    if (body.charger_price !== undefined && body.charger_price !== null) {
      const price = Math.round(Number(body.charger_price));
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json(
          { success: false, message: "Harga charger tidak valid" },
          { status: 400 }
        );
      }
      updatePayload.charger_price = price;
    }
    if (body.laptop_bag_price !== undefined && body.laptop_bag_price !== null) {
      const price = Math.round(Number(body.laptop_bag_price));
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json(
          { success: false, message: "Harga tas laptop tidak valid" },
          { status: 400 }
        );
      }
      updatePayload.laptop_bag_price = price;
    }

    const { data, error } = await supabase
      .from("laptops")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "EDIT",
      entity: "laptop",
      entityId: id,
      entityLabel: before?.laptop_name ?? data.laptop_name,
      beforeData: before,
      afterData: data,
    });

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

async function deleteHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    const { data: laptop } = await supabase
      .from("laptops")
      .select("*")
      .eq("id", id)
      .single();

    // Ambil semua unit_id milik laptop ini
    const { data: unitRows } = await supabase
      .from("laptop_units")
      .select("id")
      .eq("laptop_id", id);

    const unitIds = (unitRows ?? []).map((u: { id: string }) => u.id);

    // ── Bersihkan unit_ids array di transactions (multi-unit) ──────────────
    // FK ON DELETE SET NULL hanya handle transactions.unit_id (single).
    // unit_ids array harus dibersihkan manual.
    if (unitIds.length > 0) {
      const { data: txWithArray } = await supabase
        .from("transactions")
        .select("invoice_number, unit_ids")
        .overlaps("unit_ids", unitIds);

      if (txWithArray && txWithArray.length > 0) {
        await Promise.allSettled(
          txWithArray.map((tx) =>
            supabase
              .from("transactions")
              .update({
                unit_ids: (tx.unit_ids as string[]).filter(
                  (uid: string) => !unitIds.includes(uid)
                ),
              })
              .eq("invoice_number", tx.invoice_number)
          )
        );
      }
    }

    // Hapus semua units (transactions.unit_id auto SET NULL via FK)
    const { error: unitsError } = await supabase
      .from("laptop_units")
      .delete()
      .eq("laptop_id", id);

    if (unitsError) {
      return NextResponse.json(
        { success: false, message: "Gagal menghapus units: " + unitsError.message },
        { status: 400 }
      );
    }

    await supabase.from("warranties").delete().eq("laptop_id", id);

    const { error } = await supabase.from("laptops").delete().eq("id", id);

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "DELETE",
      entity: "laptop",
      entityId: id,
      entityLabel: laptop?.laptop_name,
      beforeData: laptop,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler);
export const PUT = withAuth(putHandler, PERMISSIONS.EDIT_LAPTOP);
export const DELETE = withAuth(deleteHandler, LAPTOP_DELETE_ROLES);