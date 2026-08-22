import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { BARANG_FULL_ACCESS_ROLES, expandRolesWithParents, hasAnyRole } from "@/lib/permissions";
import { checkDynamicPageAccess } from "@/lib/dynamicPermissions";
import { logActivity } from "@/lib/activityLogger";

interface Props {
  params: Promise<{ id: string }>;
}

// Pola sama persis dengan hasLaptopAccess() di /api/laptops/[id]/route.ts —
// dipakai supaya konsisten: role hardcode ATAU matrix dynamic permission.
async function hasBulkPriceAccess(user: AuthUser): Promise<boolean> {
  const effectiveRoles = expandRolesWithParents(user.roles ?? [user.role]);
  if (hasAnyRole(effectiveRoles, BARANG_FULL_ACCESS_ROLES)) return true;
  const dyn = await checkDynamicPageAccess(effectiveRoles, "/dashboard/laptops", "edit");
  return dyn.allowed;
}

async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    if (!(await hasBulkPriceAccess(user))) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const { id } = await props.params;
    const body = await req.json();

    const purchasePrice = Math.round(Number(body.purchase_price));
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      return NextResponse.json(
        { success: false, message: "Harga modal tidak valid" },
        { status: 400 }
      );
    }

    // Modal sparepart opsional — cuma diisi kalau dikirim dari client
    let sparepartCost: number | null = null;
    if (body.sparepart_cost !== undefined && body.sparepart_cost !== null && body.sparepart_cost !== "") {
      sparepartCost = Math.round(Number(body.sparepart_cost));
      if (!Number.isFinite(sparepartCost) || sparepartCost < 0) {
        return NextResponse.json(
          { success: false, message: "Modal sparepart tidak valid" },
          { status: 400 }
        );
      }
    }

    // unit_ids wajib dikirim dari client (hasil fetch /api/laptops/[id]/units
    // yang sudah difilter di frontend). Kalau kosong/tidak array → tolak,
    // supaya tidak ada request yang tidak sengaja update SEMUA unit di tabel.
    const unitIds: string[] = Array.isArray(body.unit_ids) ? body.unit_ids : [];
    if (unitIds.length === 0) {
      return NextResponse.json(
        { success: false, message: "Tidak ada unit yang dipilih untuk diupdate" },
        { status: 400 }
      );
    }

    const updatePayload: Record<string, unknown> = { purchase_price: purchasePrice };
    if (sparepartCost !== null) updatePayload.sparepart_cost = sparepartCost;

    // .eq("laptop_id", id) SENGAJA ditambahkan sebagai guard keamanan —
    // supaya unit_ids yang dikirim client tidak bisa dipakai untuk update
    // unit milik laptop LAIN (walau id di URL beda).
    const { data, error } = await supabase
      .from("laptop_units")
      .update(updatePayload)
      .in("id", unitIds)
      .eq("laptop_id", id)
      .select("id, serial_number, purchase_price, sparepart_cost");

       if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    // 🔍 GUARD PENTING: Supabase TIDAK melempar error kalau RLS memblokir
    // UPDATE — dia cuma balikin data kosong ([]) seolah sukses. Guard ini
    // bikin kasus itu kelihatan sebagai error jelas, bukan "sukses" palsu.
       if (!data || data.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Tidak ada unit yang berhasil diperbarui (0 dari ${unitIds.length} unit). Kemungkinan RLS/permission di tabel laptop_units memblokir update.`,
        },
        { status: 400 }
      );
    }



    if (data.length < unitIds.length) {
      const updatedIds = new Set(data.map((u) => u.id));
      const failedIds = unitIds.filter((uid) => !updatedIds.has(uid));
      return NextResponse.json(
        {
          success: false,
          message: `Hanya ${data.length} dari ${unitIds.length} unit yang berhasil diperbarui. Unit gagal (id): ${failedIds.join(", ")}`,
          data,
          failedIds,
        },
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
      entityLabel: `Isi massal harga modal (${data?.length ?? 0} unit)`,
      afterData: { purchase_price: purchasePrice, sparepart_cost: sparepartCost, unit_ids: unitIds },
    });

    return NextResponse.json({ success: true, data, count: data?.length ?? 0 });
  } catch {
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}

export const PATCH = withAuth(patchHandler);