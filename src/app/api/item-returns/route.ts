import { NextResponse } from "next/server";
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

// Status unit yang dianggap "masih bisa diretur" (belum keluar sistem).
// SOLD/KELUAR/TERJUAL/RETURNED = sudah tidak ada stoknya → tolak.
const LAPTOP_INACTIVE = ["SOLD", "KELUAR", "RETURNED"];
const ACC_INACTIVE = ["TERJUAL", "KELUAR", "RETURNED"];

// ── GET /api/item-returns ────────────────────────────────────────────────────
// Daftar retur. ?include_restored=1 untuk ikut tampilkan yang sudah di-restore.
export const GET = withAuth(async (req) => {
  const includeRestored = new URL(req.url).searchParams.get("include_restored") === "1";
  const supabase = getAdmin();

  let query = supabase
    .from("item_returns")
    .select(`
      *,
      created_by_user:users!item_returns_created_by_fkey(id, name),
      restored_by_user:users!item_returns_restored_by_fkey(id, name)
    `)
    .order("created_at", { ascending: false });

  if (!includeRestored) query = query.eq("is_restored", false);

  const { data, error } = await query;
  if (error) {
    console.error("[item-returns GET]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: data ?? [] });
}, BARANG_FULL_ACCESS_ROLES);

// ── POST /api/item-returns ───────────────────────────────────────────────────
// body: { supplier, tanggal, keterangan?, items: [{ unit_id, item_type }] }
// Harga modal TIDAK dari form — diambil server dari unit (purchase_price +
// sparepart_cost utk laptop, buy_price utk aksesoris). Multi-SN = banyak baris.
export const POST = withAuth(async (req, _ctx, user) => {
  const body = await req.json();
  const { supplier, tanggal, keterangan, items } = body as {
    supplier: string;
    tanggal: string;
    keterangan?: string | null;
    items: { unit_id: string; item_type: "LAPTOP" | "AKSESORIS" }[];
  };

  // ── Validasi input ──────────────────────────────────────────────────────
  if (!supplier?.trim())
    return NextResponse.json({ success: false, message: "Supplier wajib diisi" }, { status: 400 });
  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal))
    return NextResponse.json({ success: false, message: "Tanggal tidak valid" }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0)
    return NextResponse.json({ success: false, message: "Minimal 1 SN barang" }, { status: 400 });

  const supabase = getAdmin();
  const inserted: any[] = [];
  const failed: string[] = [];

  // Proses tiap unit: ubah status → RETURNED + insert baris retur.
  for (const it of items) {
    if (it.item_type === "LAPTOP") {
      const { data: unit } = await supabase
        .from("laptop_units")
        .select("id, serial_number, status, purchase_price, sparepart_cost, laptop_id")
        .eq("id", it.unit_id)
        .not("status", "in", `(${LAPTOP_INACTIVE.join(",")})`)
        .maybeSingle();
      if (!unit) { failed.push(it.unit_id); continue; }

      const { data: lap } = await supabase.from("laptops").select("laptop_name").eq("id", unit.laptop_id).maybeSingle();
      const modal = Math.round(Number(unit.purchase_price ?? 0)) + Math.round(Number(unit.sparepart_cost ?? 0));

      const { error: upErr } = await supabase.from("laptop_units").update({ status: "RETURNED" }).eq("id", unit.id);
      if (upErr) { failed.push(unit.serial_number); continue; }

      const { data: ret, error: insErr } = await supabase
        .from("item_returns")
        .insert({
          item_type: "LAPTOP",
          laptop_unit_id: unit.id,
          serial_number: unit.serial_number,
          item_name: lap?.laptop_name ?? null,
          prev_status: unit.status,
          supplier: supplier.trim(),
          harga: modal, // ⬅️ dari unit, bukan input manual
          tanggal,
          keterangan: keterangan?.trim() || null,
          created_by: user.id,
        })
        .select("*")
        .single();

      if (insErr) {
        await supabase.from("laptop_units").update({ status: unit.status }).eq("id", unit.id);
        failed.push(unit.serial_number);
        continue;
      }
      inserted.push(ret);
    } else {
      const { data: unit } = await supabase
        .from("accessory_units")
        .select("id, serial_number, status, buy_price, accessory_id")
        .eq("id", it.unit_id)
        .not("status", "in", `(${ACC_INACTIVE.join(",")})`)
        .maybeSingle();
      if (!unit) { failed.push(it.unit_id); continue; }

      const { data: acc } = await supabase.from("accessories").select("name").eq("id", unit.accessory_id).maybeSingle();
      const modal = Math.round(Number(unit.buy_price ?? 0));

      const { error: upErr } = await supabase.from("accessory_units").update({ status: "RETURNED" }).eq("id", unit.id);
      if (upErr) { failed.push(unit.serial_number); continue; }

      const { data: ret, error: insErr } = await supabase
        .from("item_returns")
        .insert({
          item_type: "AKSESORIS",
          accessory_unit_id: unit.id,
          serial_number: unit.serial_number,
          item_name: acc?.name ?? null,
          prev_status: unit.status,
          supplier: supplier.trim(),
          harga: modal,
          tanggal,
          keterangan: keterangan?.trim() || null,
          created_by: user.id,
        })
        .select("*")
        .single();

      if (insErr) {
        await supabase.from("accessory_units").update({ status: unit.status }).eq("id", unit.id);
        failed.push(unit.serial_number);
        continue;
      }
      inserted.push(ret);
    }
  }

  if (inserted.length === 0)
    return NextResponse.json({ success: false, message: "Semua SN gagal diproses / sudah tidak aktif" }, { status: 400 });

  return NextResponse.json({
    success: true,
    data: inserted,
    message: failed.length > 0
      ? `${inserted.length} SN diretur, ${failed.length} gagal (sudah tidak aktif)`
      : `${inserted.length} SN berhasil diretur`,
  }, { status: 201 });
}, BARANG_FULL_ACCESS_ROLES);