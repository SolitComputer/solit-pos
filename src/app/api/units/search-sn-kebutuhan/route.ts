import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { ITEM_OUTFLOW_ROLES } from "@/lib/permissions";

// Cari UNIT laptop (by SN) yang masih aktif (bukan SOLD/KELUAR) sebagai
// TUJUAN transfer modal aksesoris. Bawa purchase_price (modal laptop sekarang).
async function getHandler(req: NextRequest, _ctx: unknown, _user: AuthUser) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ success: true, data: [] });

  const { data: units, error } = await supabaseAdmin
    .from("laptop_units")
    .select("id, serial_number, laptop_id, status, purchase_price")
    .ilike("serial_number", `%${q}%`)
    .limit(40);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  const active = (units ?? []).filter((u: any) => u.status !== "SOLD" && u.status !== "KELUAR").slice(0, 20);

  const laptopIds = [...new Set(active.map((u: any) => u.laptop_id).filter(Boolean))];
  const { data: laptops } = laptopIds.length
    ? await supabaseAdmin.from("laptops").select("id, laptop_name").in("id", laptopIds)
    : { data: [] as any[] };
  const nameMap = new Map((laptops ?? []).map((l: any) => [l.id, l.laptop_name]));

  const data = active.map((u: any) => ({
    unit_id: u.id,
    serial_number: u.serial_number,
    laptop_id: u.laptop_id,
    laptop_name: nameMap.get(u.laptop_id) ?? "Laptop",
    purchase_price: Math.round(Number(u.purchase_price ?? 0)),
  }));

  return NextResponse.json({ success: true, data });
}

export const GET = withAuth(getHandler, ITEM_OUTFLOW_ROLES);