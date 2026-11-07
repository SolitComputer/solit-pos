// src/app/api/so/reset/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import {
  SO_RESET_ROLES,
  hasAnyRole,
  expandRolesWithParents,
} from "@/lib/permissions";

/**
 * POST /api/so/reset
 * Reset SO MANUAL untuk SEMUA level sekaligus:
 *   - laptops.so_at / so_by
 *   - laptop_units.so_at / so_by
 *   - accessories.so_at / so_by
 *   - accessory_units.so_at / so_by
 *
 * Field master barang (nama, harga, stok, SN, dsb) TIDAK disentuh — hanya
 * kolom SO. Riwayat SO di laptop_so_logs / laptop_unit_so_logs / dst juga
 * TIDAK dihapus, biar audit trail tetap utuh.
 */
async function handler(_req: NextRequest, _ctx: unknown, user: AuthUser) {
  try {
    const roles = expandRolesWithParents(user.roles ?? [user.role]);
    if (!hasAnyRole(roles, SO_RESET_ROLES)) {
      return NextResponse.json(
        { success: false, message: "Forbidden: hanya Admin, Kepala Admin Barang, dan Admin Barang yang boleh reset SO" },
        { status: 403 }
      );
    }

    // Filter `.not("so_at", "is", null)` dipakai supaya UPDATE cuma menyentuh
    // baris yang memang punya so_at — mengurangi beban write di tabel besar.
    const [lapRes, lapUnitRes, accRes, accUnitRes] = await Promise.all([
      supabase.from("laptops")
        .update({ so_at: null, so_by: null })
        .not("so_at", "is", null),
      supabase.from("laptop_units")
        .update({ so_at: null, so_by: null })
        .not("so_at", "is", null),
      supabase.from("accessories")
        .update({ so_at: null, so_by: null })
        .not("so_at", "is", null),
      supabase.from("accessory_units")
        .update({ so_at: null, so_by: null })
        .not("so_at", "is", null),
    ]);

    const firstError = [lapRes, lapUnitRes, accRes, accUnitRes]
      .map(r => r.error)
      .find(Boolean);

    if (firstError) {
      return NextResponse.json(
        { success: false, message: firstError.message },
        { status: 500 }
      );
    }

    // Audit trail — siapa yang pencet Reset SO, kapan.
    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "RESET_SO",
      entity: "data_barang", // ganti dash → underscore biar konsisten dengan konvensi LogEntity lain
      entityId: "all",
      entityLabel: "Reset SO Manual — semua laptop, aksesori & unit",
      reason: "Reset manual dari halaman Data Barang",
    });

    return NextResponse.json({
      success: true,
      message: "Semua data SO berhasil direset",
    });
  } catch (err: any) {
    console.error("[POST /api/so/reset]", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler);