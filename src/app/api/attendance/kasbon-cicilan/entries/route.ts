import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ⬅️ REVISI — disamakan dengan route.ts: hanya role full-access yang boleh lihat
// detail SEMUA karyawan. Non-admin lain tetap boleh buka detail, TAPI hanya miliknya.
const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];
function getRoles(user: any): string[] {
  return Array.isArray(user?.roles) && user.roles.length > 0 ? user.roles : user?.role ? [user.role] : [];
}
// ⬅️ BARU — deteksi role PKL (samakan dgn route.ts & page.tsx)
function isPKLRole(role?: string): boolean {
  if (!role) return false;
  return role === "PKL" || role.startsWith("PKL_") || role.startsWith("PKL-");
}
function isAdminUser(user: any): boolean {
  return getRoles(user).some((r) => FULL_ACCESS_ROLES.includes(r));
}

// Daftar entry kasbon/cicilan satu karyawan di bulan terpilih (IN & OUT) utk modal detail/edit
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    // ⬅️ REVISI — jangan tolak semua non-admin. Hanya PKL yang diblok (kecuali dia
    // juga full-access). Non-admin lain lanjut, tapi di bawah dipaksa hanya baca
    // entry miliknya sendiri.
    const canViewAll = isAdminUser(user);
    const userHasPKLRole = getRoles(user).some((r) => isPKLRole(r));
    if (!canViewAll && userHasPKLRole) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get("user_id");
    const year = parseInt(searchParams.get("year") ?? "", 10);
    const month = parseInt(searchParams.get("month") ?? "", 10); // 1..12
    if (!requestedUserId || Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ success: false, message: "user_id, year, month wajib" }, { status: 400 });
    }

    // ⬅️ BARU — non-admin DIPAKSA hanya boleh baca entry miliknya sendiri. user_id
    // dari query diabaikan untuk mereka, jadi walau URL/DevTools diubah ke id orang
    // lain, yang keluar tetap punya dirinya.
    const userId = canViewAll ? requestedUserId : user.id;

    const mm = String(month).padStart(2, "0");
    const monthStart = `${year}-${mm}-01`;
    const nextMonthStart = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    const { data, error } = await supabase
      .from("cashflow_entries")
      .select("id, direction, category, nominal, tanggal, keterangan, source_type, is_audited, created_at")
      .eq("target_user_id", userId)
      .in("category", ["KASBON", "CICILAN"])
      .gte("tanggal", monthStart)
      .lt("tanggal", nextMonthStart)
      .order("tanggal", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err: any) {
    console.error("[kasbon-cicilan/entries GET] exception:", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Server error" }, { status: 500 });
  }
}