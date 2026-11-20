// src/app/api/data-barang/sn-lepas/route.ts
//
// GET /api/data-barang/sn-lepas
// Return list unit (laptop_units + accessory_units) yang laptop_id=NULL
// atau accessory_id=NULL — a.k.a. SN Lepas (tanpa folder). Dipakai untuk
// section "🆓 SN Lepas" di etalase Data Barang.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";

async function getHandler(_req: NextRequest, _ctx: unknown, _user: AuthUser) {
  try {
    const [lapRes, accRes] = await Promise.all([
      supabase
        .from("laptop_units")
        .select("id, serial_number, status, qc_status, device_type, category, name, brand, cpu, ram, storage, gpu, display, grade, purchase_price, sparepart_cost, selling_price, source, branch, notes, condition_note, created_at")
        .is("laptop_id", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("accessory_units")
        .select("id, serial_number, status, device_type, category, name, brand, spec, grade, condition, buy_price, selling_price, source, branch, notes, created_at")
        .is("accessory_id", null)
        .order("created_at", { ascending: false }),
    ]);

    if (lapRes.error) return NextResponse.json({ success: false, message: lapRes.error.message }, { status: 400 });
    if (accRes.error) return NextResponse.json({ success: false, message: accRes.error.message }, { status: 400 });

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