import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { expandRolesWithParents } from "@/lib/permissions";
import { checkDynamicPageAccess } from "@/lib/dynamicPermissions";
import { logActivity } from "@/lib/activityLogger";

async function handler(req: NextRequest, _ctx: unknown, user: AuthUser) {
  try {
    const effectiveRoles = expandRolesWithParents(user.roles ?? [user.role]);
    const hasStaticAccess = effectiveRoles.some(r => (PERMISSIONS.CREATE_LAPTOP as string[]).includes(r));
    if (!hasStaticAccess) {
      const dyn = await checkDynamicPageAccess(effectiveRoles, "/dashboard/laptops", "create");
      if (!dyn.allowed) {
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      }
    }

    const body = await req.json();

    const { data: laptop, error } = await supabase
      .from("laptops")
      .insert({
        laptop_name: body.laptop_name,
        brand: body.brand,
        cpu: body.cpu,
        ram: body.ram,
        storage: body.storage,
        gpu: body.gpu,
        display: body.display,
        serial_number: body.serial_number,
        purchase_price: Math.round(Number(body.purchase_price) || 0),
        selling_price: Math.round(Number(body.selling_price) || 0),
        qty: 0,           
        status: "BELUM_SIAP",
        condition_note: body.condition_note,
        notes: body.notes,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

   try {
      await logActivity({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: "CREATE",
        entity: "laptop",
        entityId: laptop.id,
        entityLabel: laptop.laptop_name,
        afterData: laptop,
      });
    } catch (logErr) {
      // Laptop SUDAH tersimpan di titik ini — kegagalan logging
      // tidak boleh membuat response ke user jadi "gagal".
      console.error("logActivity gagal (laptop tetap tersimpan):", logErr);
    }

    return NextResponse.json({ success: true, data: laptop });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler);