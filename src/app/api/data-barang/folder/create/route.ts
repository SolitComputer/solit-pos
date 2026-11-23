import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { UserRole } from "@/lib/permissions";

const ALLOWED_ROLES: UserRole[] = ["ADMIN", "KEPALA_ADMIN_BARANG", "ADMIN_BARANG"];

async function postHandler(req: NextRequest, _ctx: unknown, user: AuthUser) {
  try {
    const body = await req.json();
    const { type, category } = body;

    if (type !== "LAPTOP" && type !== "AKSESORIS") {
      return NextResponse.json({ success: false, message: "Type harus LAPTOP atau AKSESORIS" }, { status: 400 });
    }
    if (!category || typeof category !== "string" || !category.trim()) {
      return NextResponse.json({ success: false, message: "Kategori wajib diisi" }, { status: 400 });
    }

    // Validate kategori exists di laptop_categories dengan type match
    const { data: catCheck, error: catErr } = await supabase
      .from("laptop_categories")
      .select("id, name")
      .eq("name", category)
      .eq("type", type)
      .maybeSingle();

    if (catErr) return NextResponse.json({ success: false, message: catErr.message }, { status: 400 });
    if (!catCheck) {
      return NextResponse.json({
        success: false,
        message: `Kategori "${category}" tidak ditemukan untuk type ${type}`,
      }, { status: 400 });
    }

    // Create folder — semua field identitas detail NULL
    if (type === "LAPTOP") {
      // device_type ikut nama kategori: "PC" pakai device_type='PC',
      // kategori lain (Laptop/I Mac/Monitor/Printer) pakai device_type='LAPTOP'.
      // Konsisten dengan isLaptopCategoryType() di UnifiedBarangContent.tsx.
      const deviceType = catCheck.name.trim().toUpperCase() === "PC" ? "PC" : "LAPTOP";
      // ⬅️ FIX: pakai supabaseAdmin biar bypass RLS. Endpoint sudah di-gate role
      // via withAuth(postHandler, ALLOWED_ROLES) jadi aman.
      const { data, error } = await supabaseAdmin.from("laptops").insert({
        device_type: deviceType,
        category: catCheck.name,
        laptop_name: null, brand: null, cpu: null, ram: null, storage: null,
        gpu: null, display: null, selling_price: null, grade: null,
        is_mixed_grade: false,
      }).select("id, device_type, category").single();

      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });
      return NextResponse.json({ success: true, folder: data });
    }

    // AKSESORIS
    // ⬅️ FIX: pakai supabaseAdmin biar bypass RLS (sama dengan branch LAPTOP di atas).
    // Endpoint sudah di-gate role via withAuth(postHandler, ALLOWED_ROLES) jadi aman.
    // ⬅️ FIX #2: device_type DIHAPUS dari payload — CHECK constraint
    //   accessories_device_type_check menolak value "ACCESSORY". Biarin DB
    //   pakai default (NULL atau value valid dari constraint). Kalau Moreno
    //   nanti perlu Printer tracking di accessories, baru kita set device_type
    //   sesuai nilai yang valid (lihat SQL check di komentar bawah).
    const { data, error } = await supabaseAdmin.from("accessories").insert({
      category: catCheck.name,
      name: null, brand: null, spec: null,
      buy_price: null, sell_price: null, grade: null,
      stock: 0, is_mixed_grade: false,
    }).select("id, device_type, category").single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    return NextResponse.json({ success: true, folder: data });
  } catch (err) {
    console.error("[folder/create]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, ALLOWED_ROLES);