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
// body: { item_type, serial_number, supplier, harga, tanggal, keterangan? }
// Efek: unit.status → RETURNED (stok turun) + 1 baris item_returns.
export const POST = withAuth(async (req, _ctx, user) => {
  const body = await req.json();
  const { item_type, serial_number, supplier, harga, tanggal, keterangan } = body as {
    item_type: "LAPTOP" | "AKSESORIS";
    serial_number: string;
    supplier: string;
    harga: number;
    tanggal: string;
    keterangan?: string | null;
  };

  // ── Validasi input ──────────────────────────────────────────────────────
  if (item_type !== "LAPTOP" && item_type !== "AKSESORIS")
    return NextResponse.json({ success: false, message: "Tipe barang tidak valid" }, { status: 400 });
  if (!serial_number?.trim())
    return NextResponse.json({ success: false, message: "SN wajib diisi" }, { status: 400 });
  if (!supplier?.trim())
    return NextResponse.json({ success: false, message: "Supplier wajib diisi" }, { status: 400 });
  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal))
    return NextResponse.json({ success: false, message: "Tanggal tidak valid" }, { status: 400 });
  const nominal = Math.round(Number(harga));
  if (!Number.isFinite(nominal) || nominal < 0)
    return NextResponse.json({ success: false, message: "Harga tidak valid" }, { status: 400 });

  const supabase = getAdmin();
  const sn = serial_number.trim();

  // ── Cari unit aktif berdasarkan SN ──────────────────────────────────────
  if (item_type === "LAPTOP") {
    const { data: unit, error: findErr } = await supabase
      .from("laptop_units")
      .select("id, serial_number, status, laptop_id")
      .eq("serial_number", sn)
      .not("status", "in", `(${LAPTOP_INACTIVE.join(",")})`)
      .maybeSingle();

    if (findErr) return NextResponse.json({ success: false, message: findErr.message }, { status: 500 });
    if (!unit)
      return NextResponse.json({ success: false, message: `SN "${sn}" tidak ditemukan / sudah tidak aktif` }, { status: 404 });

    // Ambil nama laptop utk snapshot
    const { data: lap } = await supabase.from("laptops").select("laptop_name").eq("id", unit.laptop_id).maybeSingle();

    // 1) Ubah status unit → RETURNED (stok turun)
    const { error: upErr } = await supabase
      .from("laptop_units")
      .update({ status: "RETURNED" })
      .eq("id", unit.id);
    if (upErr) return NextResponse.json({ success: false, message: upErr.message }, { status: 500 });
    // 2) Insert baris retur — prev_status = status unit SEBELUM jadi RETURNED,
    //    dipakai saat restore untuk memulihkan status aslinya (bukan hardcode).
    const { data: ret, error: insErr } = await supabase
      .from("item_returns")
      .insert({
        item_type: "LAPTOP",
        laptop_unit_id: unit.id,
        serial_number: sn,
        item_name: lap?.laptop_name ?? null,
        prev_status: unit.status, // ⬅️ snapshot status asli unit
        supplier: supplier.trim(),
        harga: nominal,
        tanggal,
        keterangan: keterangan?.trim() || null,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (insErr) {
      // rollback status unit kalau insert gagal (biar tidak nyangkut RETURNED tanpa record)
      await supabase.from("laptop_units").update({ status: unit.status }).eq("id", unit.id);
      return NextResponse.json({ success: false, message: insErr.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: ret }, { status: 201 });
  }

  // ── AKSESORIS ───────────────────────────────────────────────────────────
  const { data: unit, error: findErr } = await supabase
    .from("accessory_units")
    .select("id, serial_number, status, accessory_id")
    .eq("serial_number", sn)
    .not("status", "in", `(${ACC_INACTIVE.join(",")})`)
    .maybeSingle();

  if (findErr) return NextResponse.json({ success: false, message: findErr.message }, { status: 500 });
  if (!unit)
    return NextResponse.json({ success: false, message: `SN "${sn}" tidak ditemukan / sudah tidak aktif` }, { status: 404 });

  const { data: acc } = await supabase.from("accessories").select("name").eq("id", unit.accessory_id).maybeSingle();

  const { error: upErr } = await supabase
    .from("accessory_units")
    .update({ status: "RETURNED" })
    .eq("id", unit.id);
  if (upErr) return NextResponse.json({ success: false, message: upErr.message }, { status: 500 });

  const { data: ret, error: insErr } = await supabase
    .from("item_returns")
    .insert({
      item_type: "AKSESORIS",
      accessory_unit_id: unit.id,
      serial_number: sn,
      item_name: acc?.name ?? null,
      prev_status: unit.status, // ⬅️ snapshot status asli unit
      supplier: supplier.trim(),
      harga: nominal,
      tanggal,
      keterangan: keterangan?.trim() || null,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (insErr) {
    await supabase.from("accessory_units").update({ status: unit.status }).eq("id", unit.id);
    return NextResponse.json({ success: false, message: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: ret }, { status: 201 });
}, BARANG_FULL_ACCESS_ROLES);