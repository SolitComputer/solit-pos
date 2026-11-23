// src/app/api/data-barang/unit/[unitId]/compatible-folders/route.ts
//
// GET — Return folder yang KOMPATIBEL dengan unit tertentu, buat dropdown
// "Pindahkan Unit → Folder Tujuan". 2 kategori hasil:
//   (a) empty_folders: folder yang identitas detail-nya NULL tapi category
//       match. Pindah ke sini → folder adopt identitas dari unit.
//   (b) matching_folders: folder yang udah punya identitas DAN 5 field
//       pengunci-nya 100% match dengan unit.
// Folder yang category beda atau 5 field beda SENGAJA nggak muncul — strict,
// konsisten dengan Edge 2 (tolak spec beda).

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { UserRole } from "@/lib/permissions";

const ALLOWED_ROLES: UserRole[] = ["ADMIN", "KEPALA_ADMIN_BARANG", "ADMIN_BARANG"];

interface Props { params: Promise<{ unitId: string }>; }

async function getHandler(_req: NextRequest, props: Props, _user: AuthUser) {
  try {
    const { unitId } = await props.params;

    // 1. Deteksi unit ini dari laptop_units atau accessory_units
    const { data: lapUnit } = await supabaseAdmin
      .from("laptop_units")
      .select("id, laptop_id, device_type, category, grade, brand, cpu, ram, storage, gpu, display, selling_price, laptop_name")
      .eq("id", unitId)
      .maybeSingle();

    const { data: accUnit } = !lapUnit ? await supabaseAdmin
      .from("accessory_units")
      .select("id, accessory_id, device_type, category, grade, brand, spec, sell_price, name")
      .eq("id", unitId)
      .maybeSingle() : { data: null };

    if (!lapUnit && !accUnit) {
      return NextResponse.json({ success: false, message: "Unit tidak ditemukan" }, { status: 404 });
    }

    const isLaptop = !!lapUnit;
    const unit = (lapUnit ?? accUnit)!;
    const currentFolderId = isLaptop ? (lapUnit!.laptop_id) : (accUnit!.accessory_id);

    // 2. Query folder dari tabel yang sesuai
    if (isLaptop) {
      // Folder kosong: category match + laptop_name NULL
      // FIX case-insensitive: folder lama bisa punya category "LAPTOP" (uppercase)
      // sementara unit.category "Laptop" (title). Pakai .ilike() biar aman.
      const { data: empty } = await supabaseAdmin
        .from("laptops")
        .select("id, device_type, category")
        .ilike("category", lapUnit!.category ?? "")
        .is("laptop_name", null)
        .is("archived_at", null);

      // Folder isi: 5 field pengunci match
      // cpu/ram/storage/gpu/display handle NULL dengan .is() atau .eq()
      let matchQuery = supabaseAdmin
        .from("laptops")
        .select("id, device_type, category, laptop_name, brand, cpu, ram, storage, gpu, display, selling_price, grade")
        .ilike("category", lapUnit!.category ?? "")
        .eq("laptop_name", lapUnit!.laptop_name)
        .eq("selling_price", lapUnit!.selling_price)
        .is("archived_at", null);

      // Grade: tolerate NULL==NULL (treated as match)
      if (lapUnit!.grade !== null) matchQuery = matchQuery.eq("grade", lapUnit!.grade);
      else matchQuery = matchQuery.is("grade", null);
      // Spek: 5 komponen
      for (const [col, val] of [
        ["cpu", lapUnit!.cpu], ["ram", lapUnit!.ram], ["storage", lapUnit!.storage],
        ["gpu", lapUnit!.gpu], ["display", lapUnit!.display],
      ] as const) {
        matchQuery = val !== null ? matchQuery.eq(col, val) : matchQuery.is(col, null);
      }

      const { data: matching } = await matchQuery;

      return NextResponse.json({
        success: true,
        current_folder_id: currentFolderId,
        empty_folders: (empty ?? []).filter(f => f.id !== currentFolderId),
        matching_folders: (matching ?? []).filter(f => f.id !== currentFolderId),
      });
    }

    // Aksesoris
    const { data: empty } = await supabaseAdmin
      .from("accessories")
      .select("id, device_type, category")
      .ilike("category", accUnit!.category ?? "")
      .is("name", null)
      .is("archived_at", null);

    let matchQuery = supabaseAdmin
      .from("accessories")
      .select("id, device_type, category, name, brand, spec, sell_price, grade")
      .ilike("category", accUnit!.category ?? "")
      .eq("name", accUnit!.name)
      .eq("sell_price", accUnit!.sell_price)
      .is("archived_at", null);

    if (accUnit!.grade !== null) matchQuery = matchQuery.eq("grade", accUnit!.grade);
    else matchQuery = matchQuery.is("grade", null);

    for (const [col, val] of [["brand", accUnit!.brand], ["spec", accUnit!.spec]] as const) {
      matchQuery = val !== null ? matchQuery.eq(col, val) : matchQuery.is(col, null);
    }

    const { data: matching } = await matchQuery;

    return NextResponse.json({
      success: true,
      current_folder_id: currentFolderId,
      empty_folders: (empty ?? []).filter(f => f.id !== currentFolderId),
      matching_folders: (matching ?? []).filter(f => f.id !== currentFolderId),
    });
  } catch (err) {
    console.error("[compatible-folders GET]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, ALLOWED_ROLES);