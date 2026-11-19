// src/app/api/laptops/sparepart-queue/empty-units/route.ts
//
// GET /api/laptops/sparepart-queue/empty-units
// Return unit yang qc_status='IN_SPAREPART' TAPI belum ada sparepart record
// MENUNGGU. Dipakai tab Antrian Sparepart supaya unit baru (hasil keputusan
// "Bisa Diperbaiki") tetap muncul sebagai card kosong — user bisa langsung
// tambah sparepart atau klik "Selesai Tanpa Sparepart".

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PENGELOLA_DECISION_ROLES } from "@/lib/permissions";

async function getHandler(_req: NextRequest, _ctx: unknown, _user: AuthUser) {
  try {
    // 1. Semua unit IN_SPAREPART (exclude yang sudah terjual/keluar)
    const OUT_STATUSES = ["SOLD", "TERJUAL", "KELUAR", "RETURNED"];
    const { data: units, error: unitErr } = await supabase
      .from("laptop_units")
      .select("id, serial_number, laptop_id, laptop:laptops(id, laptop_name, brand)")
      .eq("qc_status", "IN_SPAREPART")
      .not("status", "in", `(${OUT_STATUSES.join(",")})`);

    if (unitErr) {
      return NextResponse.json({ success: false, message: unitErr.message }, { status: 400 });
    }

    const unitIds = (units ?? []).map(u => u.id);
    if (unitIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 2. Cari unit_ids yang SUDAH ada sparepart MENUNGGU
    const { data: existingSp, error: spErr } = await supabase
      .from("sparepart_queue")
      .select("unit_id")
      .in("unit_id", unitIds)
      .eq("status", "MENUNGGU");

    if (spErr) {
      return NextResponse.json({ success: false, message: spErr.message }, { status: 400 });
    }

    const withSparepart = new Set((existingSp ?? []).map(s => s.unit_id));

    // 3. Return unit yang BELUM ada sparepart
    const emptyUnits = (units ?? [])
      .filter(u => !withSparepart.has(u.id))
      .map(u => ({
        unit_id: u.id,
        serial_number: u.serial_number,
        laptop_id: u.laptop_id,
        laptop: u.laptop,
      }));

    return NextResponse.json({ success: true, data: emptyUnits });
  } catch (err) {
    console.error("[sparepart-queue/empty-units GET]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, PENGELOLA_DECISION_ROLES);