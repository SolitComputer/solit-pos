import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { BARANG_FULL_ACCESS_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Status unit yang TIDAK bisa diretur (sudah keluar sistem / sudah diretur).
const LAPTOP_INACTIVE = ["SOLD", "KELUAR", "RETURNED"];
const ACC_INACTIVE = ["TERJUAL", "KELUAR", "RETURNED"];

// ── GET /api/item-returns/search-sn?q=xxx ────────────────────────────────────
// Cari SN laptop & aksesoris aktif di Data Barang. Balikin SN + nama + harga
// modal (laptop: purchase_price + sparepart_cost; aksesoris: buy_price).
export const GET = withAuth(async (req: NextRequest) => {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ success: true, data: [] });

  const supabase = getAdmin();

  const [laptopRes, accRes] = await Promise.all([
    supabase
      .from("laptop_units")
      .select("id, serial_number, status, purchase_price, sparepart_cost, laptops(id, laptop_name)")
      .ilike("serial_number", `%${q}%`)
      .not("status", "in", `(${LAPTOP_INACTIVE.join(",")})`)
      .limit(8)
      .order("serial_number"),
    supabase
      .from("accessory_units")
      .select("id, serial_number, status, buy_price, accessories(id, name, brand, spec)")
      .ilike("serial_number", `%${q}%`)
      .not("status", "in", `(${ACC_INACTIVE.join(",")})`)
      .limit(8)
      .order("serial_number"),
  ]);

  if (laptopRes.error) console.error("[item-returns search-sn laptop]", laptopRes.error);
  if (accRes.error) console.error("[item-returns search-sn acc]", accRes.error);

  // Laptop: modal = purchase_price + sparepart_cost (konsisten dgn jurnal).
  const laptopFmt = (laptopRes.data || [])
    .filter((u: any) => Boolean(u.laptops?.id) && Boolean(u.laptops?.laptop_name))
    .map((u: any) => ({
      unit_id: u.id,
      item_type: "LAPTOP" as const,
      serial_number: u.serial_number,
      item_name: u.laptops.laptop_name,
      harga_modal: Math.round(Number(u.purchase_price ?? 0)) + Math.round(Number(u.sparepart_cost ?? 0)),
    }));

  // Aksesoris: modal = buy_price unit.
  const accFmt = (accRes.data || [])
    .filter((u: any) => Boolean(u.accessories?.id))
    .map((u: any) => {
      const acc = u.accessories;
      const name = [acc.name, acc.brand, acc.spec].filter(Boolean).join(" ");
      return {
        unit_id: u.id,
        item_type: "AKSESORIS" as const,
        serial_number: u.serial_number,
        item_name: name,
        harga_modal: Math.round(Number(u.buy_price ?? 0)),
      };
    });

  const merged = [...laptopFmt, ...accFmt].slice(0, 12);
  return NextResponse.json({ success: true, data: merged });
}, BARANG_FULL_ACCESS_ROLES);