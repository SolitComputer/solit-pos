import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { hasAnyRole, OFFICIAL_PRICE_EDIT_ROLES } from "@/lib/permissions";

interface Props {
  params: Promise<{ id: string }>;
}

// ── PATCH: Update Harga Store & Harga Sparepart untuk SEMUA unit aktif
//           milik satu laptop model sekaligus (bukan satu-satu). ────────────
async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const body = await req.json();
   const { selling_price, sparepart_cost, official_price } = body;

    const updatePayload: Record<string, unknown> = {};

    if (selling_price !== undefined && selling_price !== null) {
      const price = Math.round(Number(selling_price));
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json(
          { success: false, message: "Harga Store tidak valid" },
          { status: 400 }
        );
      }
      updatePayload.selling_price = price;
    }

    if (sparepart_cost !== undefined && sparepart_cost !== null) {
      const price = Math.round(Number(sparepart_cost));
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json(
          { success: false, message: "Harga sparepart tidak valid" },
          { status: 400 }
        );
      }
      updatePayload.sparepart_cost = price;
    }

        if (official_price !== undefined && official_price !== null) {
      // 🔒 Field-level auth — di frontend field ini cuma di-disable untuk
      // non-admin, itu bukan proteksi (bisa dilewati via direct API call
      // pakai Postman/curl). Guard ini yang benar-benar cegah role selain
      // OFFICIAL_PRICE_EDIT_ROLES ubah Harga Official, sama polanya dgn
      // proteksi field SN/Sumber Barang di PUT /api/units/[id]/route.ts.
      const effectiveRoles: string[] =
        Array.isArray((user as { roles?: string[] }).roles) && (user as { roles?: string[] }).roles!.length > 0
          ? (user as { roles?: string[] }).roles!
          : [user.role];
      if (!hasAnyRole(effectiveRoles, OFFICIAL_PRICE_EDIT_ROLES)) {
        return NextResponse.json(
          { success: false, message: "Harga Official hanya bisa diubah oleh Admin" },
          { status: 403 }
        );
      }

      const price = Math.round(Number(official_price));
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json(
          { success: false, message: "Harga Official tidak valid" },
          { status: 400 }
        );
      }
      updatePayload.official_price = price;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { success: false, message: "Tidak ada data untuk diperbarui" },
        { status: 400 }
      );
    }

    //  Hanya update unit yang masih aktif — unit SOLD harga historisnya dikunci
    //  supaya laporan penjualan lama tidak berubah retroaktif.
    const { data, error } = await supabase
      .from("laptop_units")
      .update(updatePayload)
      .eq("laptop_id", id)
      .neq("status", "SOLD")
      .select("id");

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    const { data: laptop } = await supabase
      .from("laptops")
      .select("laptop_name")
      .eq("id", id)
      .single();

    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "EDIT",
      entity: "laptop",
      entityId: id,
      entityLabel: `[Bulk] ${laptop?.laptop_name ?? ""} — ${data?.length ?? 0} unit diperbarui`,
      afterData: updatePayload,
    });

    return NextResponse.json({ success: true, updated: data?.length ?? 0 });
  } catch {
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}

export const PATCH = withAuth(patchHandler, PERMISSIONS.EDIT_UNITS);