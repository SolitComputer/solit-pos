import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { PERMISSIONS } from "@/lib/permissions";

interface Props {
  params: Promise<{ id: string }>;
}

//  Edit "Sumber Barang" untuk SEMUA unit satu model sekaligus (bukan satu-satu).
//  Dipakai saat stok > 1: ketik 1x → semua unit ikut ke-update.
async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const body = await req.json();

    const source = typeof body.source === "string" ? body.source.trim() : null;

    const { data, error } = await supabase
      .from("laptop_units")
      .update({ source: source || null })
      .eq("laptop_id", id)
      .select("id");

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "EDIT",
      entity: "laptop",
      entityId: id,
      entityLabel: `Sumber → "${source ?? "-"}" (${data?.length ?? 0} unit)`,
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