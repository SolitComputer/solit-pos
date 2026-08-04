import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { expandRolesWithParents } from "@/lib/permissions";
import { checkDynamicPageAccess } from "@/lib/dynamicPermissions";
import { logActivity } from "@/lib/activityLogger";
import { recalcLaptopParentQty } from "@/lib/laptopStock";

// Markup tetap untuk Harga Official = Harga Setor + markup ini.
const OFFICIAL_PRICE_MARKUP = 300_000;

interface Props {
  params: Promise<{ id: string }>;
}

// ── GET: Ambil semua unit milik laptop tertentu ───────────────────────────────
async function getHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    const { data, error } = await supabase
      .from("laptop_units")
      .select("*")
      .eq("laptop_id", id)
      .order("serial_number", { ascending: true }); // ← konsisten dgn /api/units

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Gagal mengambil data units" },
      { status: 500 }
    );
  }
}

// ── POST: Tambah satu unit baru ke laptop ─────────────────────────────────────
async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const effectiveRoles = expandRolesWithParents(user.roles ?? [user.role]);
    const hasStaticAccess = effectiveRoles.some(r => (PERMISSIONS.CREATE_UNITS as string[]).includes(r));
    if (!hasStaticAccess) {
      const dyn = await checkDynamicPageAccess(effectiveRoles, "/dashboard/units", "create");
      if (!dyn.allowed) {
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      }
    }

    const { id } = await props.params;
    const body = await req.json();

    const {
      serial_number,
      grade,
      condition_note,
      purchase_price,
      selling_price,
      sparepart_cost,
      official_price, // ← kolom baru
      status,
      notes,
      received_at,
    } = body;

    // Cek duplikat SN sebelum insert.
    // Pakai limit(1) tanpa .single() — .single() error (dan lolos) kalau SN
    // justru sudah terduplikasi (>1 baris).
    const { data: existingRows } = await supabase
      .from("laptop_units")
      .select("id")
      .eq("serial_number", serial_number)
      .limit(1);

    if (existingRows && existingRows.length > 0) {
      return NextResponse.json(
        { success: false, message: `Serial number "${serial_number}" sudah terdaftar` },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("laptop_units")
      .insert({
        laptop_id: id,
        serial_number,
        grade,
        condition_note,
        purchase_price: purchase_price != null ? Math.round(Number(purchase_price)) : 0,
        selling_price: selling_price != null ? Math.round(Number(selling_price)) : 0,
        sparepart_cost: sparepart_cost != null ? Math.round(Number(sparepart_cost)) : 0,
        official_price: selling_price != null ? Math.round(Number(selling_price)) + OFFICIAL_PRICE_MARKUP : 0, // ← auto: Harga Setor + markup
        status,
        notes,
        ...(received_at ? { created_at: received_at } : {}),
      })
      .select()
      .single();

    if (error) throw error;

    // Sinkronkan qty parent setelah menambah unit.
    await recalcLaptopParentQty(supabase, id);

    const { data: laptop } = await supabase
      .from("laptops")
      .select("laptop_name")
      .eq("id", id)
      .single();

    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "CREATE",
      entity: "unit",
      entityId: data.id,
      entityLabel: `SN: ${data.serial_number}${laptop ? ` (${laptop.laptop_name})` : ""}`,
      afterData: data,
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Gagal menambahkan unit" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler, PERMISSIONS.VIEW_UNITS);
export const POST = withAuth(postHandler);