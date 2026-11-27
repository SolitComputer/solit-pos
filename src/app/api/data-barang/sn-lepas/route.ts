// src/app/api/data-barang/sn-lepas/route.ts
//
// GET /api/data-barang/sn-lepas
// Return list unit (laptop_units + accessory_units) yang laptop_id=NULL
// atau accessory_id=NULL — a.k.a. SN Lepas (tanpa folder). Dipakai untuk
// section "🆓 SN Lepas" di etalase Data Barang.

import { NextRequest, NextResponse } from "next/server";
// ✅ FIX: Ganti dari anon-key (@/services/supabase) ke admin-key.
// Tabel laptop_units/accessory_units kemungkinan punya RLS yang filter
// orphan units (accessory_id/laptop_id IS NULL) dari anon query → return
// array kosong → SN Lepas tidak pernah muncul di Data Barang walau data
// ada di DB. Pola ini sama dengan fix di restore/route.ts.
import { supabaseAdmin as supabase } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";

async function getHandler(_req: NextRequest, _ctx: unknown, _user: AuthUser) {
  try {
    // ✅ FIX: Pakai SELECT * biar gak break kalau salah satu kolom opsional
    //    (device_type/category/dll) belum ada di tabel. Field yang gak ada
    //    di payload tinggal null di frontend — gak ganggu rendering.
    const [lapRes, accRes] = await Promise.all([
      supabase
        .from("laptop_units")
        .select("*")
        .is("laptop_id", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("accessory_units")
        .select("*")
        .is("accessory_id", null)
        .order("created_at", { ascending: false }),
    ]);

    // Log error detail buat debug kalau masih gagal
    if (lapRes.error) {
      console.error("[sn-lepas] laptop_units error:", lapRes.error);
      return NextResponse.json({
        success: false,
        message: `Laptop units query failed: ${lapRes.error.message}`,
        detail: lapRes.error,
      }, { status: 400 });
    }
    if (accRes.error) {
      console.error("[sn-lepas] accessory_units error:", accRes.error);
      return NextResponse.json({
        success: false,
        message: `Accessory units query failed: ${accRes.error.message}`,
        detail: accRes.error,
      }, { status: 400 });
    }



    return NextResponse.json({
      success: true,
      data: {
        laptop_units: lapRes.data ?? [],
        accessory_units: accRes.data ?? [],
      },
    });
  } catch (err) {
    console.error("[sn-lepas GET]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);