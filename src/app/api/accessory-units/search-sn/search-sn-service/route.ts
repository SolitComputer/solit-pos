import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { SERVICE_VIEW_ROLES } from "@/lib/permissions";

// Cari UNIT aksesoris (by SN) yang masih TERSEDIA, sekalian bawa buy_price
// (modal) dari tabel accessories — dipakai di dialog Sparepart Servis.
async function getHandler(req: NextRequest, _ctx: unknown, _user: AuthUser) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (q.length < 1) return NextResponse.json({ success: true, data: [] });

  const { data: units, error } = await supabaseAdmin
    .from("accessory_units")
    .select("id, serial_number, accessory_id, status")
    .eq("status", "TERSEDIA")
    .ilike("serial_number", `%${q}%`)
    .limit(20);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  const accIds = [...new Set((units ?? []).map((u) => u.accessory_id).filter(Boolean))];
  const { data: accs } = accIds.length
    ? await supabaseAdmin.from("accessories").select("id, name, buy_price").in("id", accIds)
    : { data: [] as any[] };

  const accMap = new Map(
    (accs ?? []).map((a: any) => [a.id, { name: a.name as string, buy_price: Math.round(Number(a.buy_price ?? 0)) }])
  );

  const data = (units ?? []).map((u: any) => ({
    unit_id: u.id,
    serial_number: u.serial_number,
    accessory_id: u.accessory_id,
    accessory_name: accMap.get(u.accessory_id)?.name ?? "Aksesoris",
    buy_price: accMap.get(u.accessory_id)?.buy_price ?? 0,
  }));

  return NextResponse.json({ success: true, data });
}

export const GET = withAuth(getHandler, SERVICE_VIEW_ROLES);