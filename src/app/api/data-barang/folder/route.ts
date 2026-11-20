// src/app/api/data-barang/folders/route.ts
//
// GET /api/data-barang/folders?type=LAPTOP|AKSESORIS&category_id=<uuid>
// Return list folder (laptops atau accessories row) yang match type + kategori,
// dipakai dropdown "Target Folder" di modal "+ Unit/SN". Tiap folder dilengkapi
// flag is_empty (identitas detail NULL vs isi) biar UI bisa kasih indikator
// "Folder Kosong" vs "Folder Isi (adopt rules)".

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { UserRole } from "@/lib/permissions";

const ALLOWED_ROLES: UserRole[] = ["ADMIN", "KEPALA_ADMIN_BARANG", "ADMIN_BARANG"];

async function getHandler(req: NextRequest, _ctx: unknown, _user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const categoryId = searchParams.get("category_id");

    if (type !== "LAPTOP" && type !== "AKSESORIS") {
      return NextResponse.json({ success: false, message: "Type wajib LAPTOP atau AKSESORIS" }, { status: 400 });
    }
    if (!categoryId) {
      return NextResponse.json({ success: false, message: "category_id wajib" }, { status: 400 });
    }

    // 1. Ambil nama kategori dari laptop_categories (buat query filter)
    const { data: cat, error: catErr } = await supabase
      .from("laptop_categories")
      .select("name")
      .eq("id", categoryId)
      .maybeSingle();
    if (catErr || !cat) {
      return NextResponse.json({ success: false, message: "Kategori tidak ditemukan" }, { status: 404 });
    }

    // 2. Query folder dari tabel sesuai type
    if (type === "LAPTOP") {
      const { data, error } = await supabase
        .from("laptops")
        .select("id, device_type, category, laptop_name, brand, cpu, ram, storage, gpu, display, selling_price, grade")
        .eq("category", cat.name)
        .is("archived_at", null)
        .order("laptop_name", { nullsFirst: true });
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });

      return NextResponse.json({
        success: true,
        data: (data ?? []).map(f => ({
          ...f,
          is_empty: f.laptop_name === null,
        })),
      });
    }

    // AKSESORIS
    const { data, error } = await supabase
      .from("accessories")
      .select("id, device_type, category, name, brand, spec, sell_price, grade")
      .eq("category", cat.name)
      .is("archived_at", null)
      .order("name", { nullsFirst: true });
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });

    return NextResponse.json({
      success: true,
      data: (data ?? []).map(f => ({
        ...f,
        is_empty: f.name === null,
      })),
    });
  } catch (err) {
    console.error("[folders GET]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, ALLOWED_ROLES);