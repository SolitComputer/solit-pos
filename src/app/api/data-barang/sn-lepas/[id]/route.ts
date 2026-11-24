import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { LAPTOP_DELETE_ROLES } from "@/lib/permissions";

const db = supabaseAdmin ?? supabase;

interface Props {
  params: Promise<{ id: string }>;
}

async function deleteHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    // Cari unit di laptop_units (SN Lepas = laptop_id NULL)
    const { data: laptopUnit } = await db
      .from("laptop_units")
      .select("id, serial_number, status, laptop_id")
      .eq("id", id)
      .is("laptop_id", null)
      .single();

    // Kalau tidak ketemu di laptop_units, coba accessory_units
    if (!laptopUnit) {
      const { data: accUnit } = await db
        .from("accessory_units")
        .select("id, serial_number, status, accessory_id")
        .eq("id", id)
        .is("accessory_id", null)
        .single();

      if (!accUnit) {
        return NextResponse.json(
          { success: false, message: "SN Lepas tidak ditemukan" },
          { status: 404 }
        );
      }

      // Cek status blocked
      if (["SOLD", "RESERVED", "HELD", "PACKING"].includes(accUnit.status)) {
        return NextResponse.json(
          { success: false, message: `Unit SN ${accUnit.serial_number} berstatus ${accUnit.status}, tidak bisa dihapus` },
          { status: 409 }
        );
      }

      const { error } = await db
        .from("accessory_units")
        .delete()
        .eq("id", id);

      if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 400 });
      }

      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "DELETE", entity: "accessory_unit" as any,
        entityId: id, entityLabel: `SN Lepas: ${accUnit.serial_number}`,
      });

      return NextResponse.json({ success: true });
    }

    // Cek status blocked
    if (["SOLD", "RESERVED", "HELD", "PACKING"].includes(laptopUnit.status)) {
      return NextResponse.json(
        { success: false, message: `Unit SN ${laptopUnit.serial_number} berstatus ${laptopUnit.status}, tidak bisa dihapus` },
        { status: 409 }
      );
    }

    const { error } = await db
      .from("laptop_units")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: "DELETE", entity: "laptop_unit" as any,
      entityId: id, entityLabel: `SN Lepas: ${laptopUnit.serial_number}`,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}

export const DELETE = withAuth(deleteHandler, LAPTOP_DELETE_ROLES);