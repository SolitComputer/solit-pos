// src/app/api/data-barang/unit/[unitId]/compatible-folders/route.ts
//
// GET — Return folder yang KOMPATIBEL dengan unit tertentu, buat dropdown
// "Pindahkan Unit → Folder Tujuan". 2 kategori hasil:
//   (a) empty_folders: folder yang identitas detail-nya NULL tapi category
//       match. Pindah ke sini → folder adopt identitas dari unit.
//   (b) matching_folders: folder dengan CATEGORY + NAMA + GRADE match.
//       Spec detail (cpu/ram/storage/harga/dll) TIDAK di-filter di sini —
//       divalidasi permissive oleh move/route.ts saat user submit.
// Opsi B (loose match 2026-11-23) — dropdown lebih kaya, backend tetap safe.

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
    const { data: lapUnit, error: lapErr } = await supabaseAdmin
      .from("laptop_units")
      .select("id, laptop_id, device_type, category, grade, brand, cpu, ram, storage, gpu, display, selling_price, name")
      .eq("id", unitId)
      .maybeSingle();
    if (lapErr) console.error("[compatible-folders] laptop_units query error:", lapErr);

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

      // LOOSE MATCH (Opsi B): cukup CATEGORY + NAMA + GRADE.
      // Spec detail (harga, cpu, ram, storage, gpu, display) TIDAK di-filter —
      // validasi detail di-handle move/route.ts saat user submit (permissive).
      let matchQuery = supabaseAdmin
        .from("laptops")
        .select("id, device_type, category, laptop_name, brand, cpu, ram, storage, gpu, display, selling_price, grade")
        .ilike("category", lapUnit!.category ?? "")
        .eq("laptop_name", lapUnit!.name) // ⬅️ unit field namanya "name" di laptop_units
        .is("archived_at", null);

      // Grade: tolerate NULL==NULL (treated as match)
      if (lapUnit!.grade !== null) matchQuery = matchQuery.eq("grade", lapUnit!.grade);
      else matchQuery = matchQuery.is("grade", null);

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

    // LOOSE MATCH (Opsi B): cukup CATEGORY + NAMA + GRADE.
    // Spec detail (brand, spec, sell_price) TIDAK di-filter — validasi detail
    // di-handle move/route.ts saat user submit (permissive).
    let matchQuery = supabaseAdmin
      .from("accessories")
      .select("id, device_type, category, name, brand, spec, sell_price, grade")
      .ilike("category", accUnit!.category ?? "")
      .eq("name", accUnit!.name)
      .is("archived_at", null);

    if (accUnit!.grade !== null) matchQuery = matchQuery.eq("grade", accUnit!.grade);
    else matchQuery = matchQuery.is("grade", null);

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