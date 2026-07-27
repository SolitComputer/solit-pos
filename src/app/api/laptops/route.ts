import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { LAPTOP_VIEW_ROLES, BARANG_PRIVATE_VIEW_ROLES, hasAnyRole } from "@/lib/permissions";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    //  purchase_price, source, created_at ditambahkan supaya tabel Data Barang
    //  bisa menampilkan kolom Harga Modal / Sumber / Tanggal Masuk saat stok = 1.
    const { data, error } = await supabase
      .from("laptops")
    .select(`
        *,
        laptop_units (
          id,
          serial_number,
          grade,
          status,
          selling_price,
          official_price,
          purchase_price,
          sparepart_cost,
          source,
          created_at
        )
      `)
      .order("laptop_name", { ascending: true });

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    //  Field sensitif disaring DI SERVER, bukan sekadar disembunyikan di UI.
    //  Kalau hanya disembunyikan di frontend, Sales tetap bisa membacanya
    //  lewat Network tab DevTools.
    const canSeePrivate = hasAnyRole(user.roles ?? [user.role], BARANG_PRIVATE_VIEW_ROLES);

    const safe = canSeePrivate
      ? data
      : (data ?? []).map((l: Record<string, any>) => ({
          ...l,
        laptop_units: (l.laptop_units ?? []).map((u: Record<string, any>) => ({
            id: u.id,
            serial_number: u.serial_number,
            grade: u.grade,
            status: u.status,
            selling_price: u.selling_price,
            official_price: u.official_price,
          })),
        }));

    return NextResponse.json({ success: true, data: safe });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, LAPTOP_VIEW_ROLES);