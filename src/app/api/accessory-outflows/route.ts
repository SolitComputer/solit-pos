import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { UserRole } from "@/lib/permissions";
import { recordOutflow } from "@/lib/accessoryOutflow";

// GET is accessible by anyone who can access Data Barang (e.g., ADMIN, PROGRAMMER, ASISTEN_CEO, PENGELOLA_BARANG, TEKNISI)
const VIEW_ROLES: UserRole[] = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI", "CREW_SALES"];
// POST is only for admins
const EDIT_ROLES: UserRole[] = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

async function getHandler(req: NextRequest, _: any, user: AuthUser) {
  try {
    const { searchParams } = req.nextUrl;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const source = searchParams.get("source");
    const status = searchParams.get("status");
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from("accessory_outflows")
      .select(`
        *,
        accessory:accessories ( name, category ),
        unit:accessory_units ( serial_number ),
        creator:users!accessory_outflows_created_by_fkey ( name )
      `, { count: "exact" })
      .order("created_at", { ascending: false });

    if (source) query = query.eq("source_type", source);
    if (status) query = query.eq("status", status);

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({ success: true, data, count });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

async function postHandler(req: NextRequest, _: any, user: AuthUser) {
  try {
    const body = await req.json();
    const { accessory_id, unit_id, qty, taken_by_role, notes } = body;

    if (!accessory_id || !qty || qty <= 0) {
      return NextResponse.json({ success: false, error: "Accessory ID dan Qty yang valid wajib diisi" }, { status: 400 });
    }

    if (!taken_by_role || !notes) {
      return NextResponse.json({ success: false, error: "Divisi terkait dan Keterangan wajib diisi" }, { status: 400 });
    }

    // 1. Validasi stok bulk
    const { data: acc, error: accErr } = await supabaseAdmin
      .from("accessories")
      .select("stock")
      .eq("id", accessory_id)
      .single();

    if (accErr || !acc) {
      return NextResponse.json({ success: false, error: "Aksesoris tidak ditemukan" }, { status: 404 });
    }

    if (acc.stock < qty) {
      return NextResponse.json({ success: false, error: `Stok tidak cukup (Sisa: ${acc.stock})` }, { status: 400 });
    }

    // 2. Validasi + claim unit jika disertakan
    // ✅ FIX (race condition): dulu cek status lalu update terpisah — dua
    // request bersamaan bisa sama-sama lolos cek "TERSEDIA" sebelum salah
    // satu sempat menandai KELUAR. Sekarang filter status disertakan
    // langsung di UPDATE (atomic claim), jadi cuma satu yang bisa menang.
    if (unit_id) {
      const { data: claimedUnit, error: updateErr } = await supabaseAdmin
        .from("accessory_units")
        .update({ status: "KELUAR" })
        .eq("id", unit_id)
        .eq("status", "TERSEDIA")
        .select("id")
        .maybeSingle();
      if (updateErr) throw updateErr;
      if (!claimedUnit) {
        return NextResponse.json({ success: false, error: "Unit tidak ditemukan atau sudah tidak tersedia" }, { status: 400 });
      }
    }

    // 3. Kurangi stok bulk dari tabel accessories
    const { error: decErr } = await supabaseAdmin.rpc("decrement_accessory_stock", {
      p_accessory_id: accessory_id,
      p_qty: qty
    });
    if (decErr) throw decErr;

    // 4. Catat outflow manual
    await recordOutflow({
      accessory_id,
      unit_id: unit_id || null,
      source_type: "manual",
      qty,
      taken_by_role,
      notes,
      created_by: user.id
    });

    return NextResponse.json({ success: true, message: "Berhasil mencatat pengeluaran aksesoris" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, VIEW_ROLES);
export const POST = withAuth(postHandler, EDIT_ROLES);
