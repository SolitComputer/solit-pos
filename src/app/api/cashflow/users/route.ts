// src/app/api/cashflow/users/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { CASHFLOW_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Deteksi role PKL (samakan dgn isPKLRole di page.tsx: "PKL" / "PKL_*" / "PKL-*")
function isPKLRole(role?: string): boolean {
  if (!role) return false;
  return role === "PKL" || role.startsWith("PKL_") || role.startsWith("PKL-");
}

// Daftar KARYAWAN utk dropdown "Untuk Karyawan" di modal Kasbon/Cicilan
// (Cashflow Masuk/Keluar & Realisasi Pengajuan Dana). Role PKL di-exclude —
// kasbon/cicilan hanya untuk karyawan tetap. Gate CASHFLOW_ROLES supaya PURCHASING pun bisa.
export const GET = withAuth(async () => {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, role")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  const karyawanOnly = (data ?? []).filter((u: any) => !isPKLRole(u.role)); // ⬅️ buang PKL
  return NextResponse.json({ success: true, data: karyawanOnly });
}, CASHFLOW_ROLES);