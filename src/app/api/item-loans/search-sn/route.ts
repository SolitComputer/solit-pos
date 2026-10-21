import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { ITEM_LOAN_VIEW_ROLES } from "@/lib/permissions";

async function handler(req: NextRequest, _ctx: unknown, _user: AuthUser) {
  try {
    const q = (new URL(req.url).searchParams.get("q") || "").trim();
    if (q.length < 2) return NextResponse.json({ success: true, data: [] });

    const like = `%${q}%`;
    const [lap, acc] = await Promise.all([
      supabase
        .from("laptop_units")
        .select("id, serial_number, status, laptop_id, laptops(laptop_name)")
        .ilike("serial_number", like)
        .not("status", "in", "(SOLD,KELUAR)")
        .limit(15),
      supabase
        .from("accessory_units")
        .select("id, serial_number, status, accessory_id, accessories(name)")
        .ilike("serial_number", like)
        .not("status", "in", "(TERJUAL,KELUAR)")
        .limit(15),
    ]);

    const results = [
      ...((lap.data ?? []).map((u: Record<string, any>) => ({
        item_type: "LAPTOP" as const,
        item_id: u.laptop_id,
        unit_id: u.id,
        serial_number: u.serial_number,
        item_name: u.laptops?.laptop_name ?? "Laptop",
        status: u.status,
      }))),
      ...((acc.data ?? []).map((u: Record<string, any>) => ({
        item_type: "AKSESORIS" as const,
        item_id: u.accessory_id,
        unit_id: u.id,
        serial_number: u.serial_number,
        item_name: u.accessories?.name ?? "Aksesoris",
        status: u.status,
      }))),
    ];

    return NextResponse.json({ success: true, data: results });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, ITEM_LOAN_VIEW_ROLES);