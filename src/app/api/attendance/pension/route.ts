import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PENSION_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING"];
function getRoles(user: any): string[] {
  return Array.isArray(user?.roles) && user.roles.length > 0 ? user.roles : user?.role ? [user.role] : [];
}
function hasAccess(user: any): boolean {
  return getRoles(user).some((r) => PENSION_ACCESS_ROLES.includes(r));
}
function isPKLRole(role?: string): boolean {
  if (!role) return false;
  return role === "PKL" || role.startsWith("PKL_") || role.startsWith("PKL-");
}

// GET: Dana Pensiun per KARYAWAN utk 1 tahun penuh (Jan..Des + total)
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    if (!hasAccess(user)) return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") ?? "", 10);
    if (Number.isNaN(year)) return NextResponse.json({ success: false, message: "year wajib" }, { status: 400 });

    // Karyawan aktif (PKL di-exclude — konsisten dgn tab Kasbon & Cicilan)
    const { data: usersRaw, error: uErr } = await supabase
      .from("users")
      .select("id, name, role")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (uErr) return NextResponse.json({ success: false, message: uErr.message }, { status: 500 });
    const users = (usersRaw ?? []).filter((u: any) => !isPKLRole(u.role));

    // Semua potongan dana pensiun di tahun ini
    const { data: allowRows } = await supabase
      .from("user_allowances")
      .select("user_id, month, deduction_pension")
      .eq("year", year);

    const byUser: Record<string, number[]> = {};
    (allowRows ?? []).forEach((r: any) => {
      const m = Number(r.month);
      if (!Number.isFinite(m) || m < 1 || m > 12) return;
      const p = Math.max(0, Math.round(Number(r.deduction_pension ?? 0)));
      if (!byUser[r.user_id]) byUser[r.user_id] = new Array(12).fill(0);
      byUser[r.user_id][m - 1] = p;
    });

    const rows = users.map((u: any) => {
      const months = byUser[u.id] ?? new Array(12).fill(0);
      const total = months.reduce((s: number, n: number) => s + n, 0);
      return { user_id: u.id, name: u.name, role: u.role, months, total };
    });

    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    console.error("[pension GET] exception:", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Server error" }, { status: 500 });
  }
}

// POST: set/koreksi Dana Pensiun 1 karyawan utk 1 bulan — HANYA ubah deduction_pension
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    if (!hasAccess(user)) return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });

    const body = await request.json();
    const user_id = body?.user_id as string | undefined;
    const year = parseInt(String(body?.year ?? ""), 10);
    const month = parseInt(String(body?.month ?? ""), 10); // 1..12
    const pension = Math.round(Number(body?.pension ?? 0));

    if (!user_id || Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ success: false, message: "user_id, year, month wajib" }, { status: 400 });
    }
    if (!Number.isFinite(pension) || pension < 0) {
      return NextResponse.json({ success: false, message: "Nominal pensiun tidak valid" }, { status: 400 });
    }

    // Kalau baris allowance bulan itu sudah ada → update kolom pensiun saja (jangan
    // timpa tunjangan/kasbon/cicilan). Kalau belum ada → insert baru, kolom lain default 0.
    const { data: existing } = await supabase
      .from("user_allowances")
      .select("id")
      .eq("user_id", user_id)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("user_allowances")
        .update({ deduction_pension: pension, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    } else {
      const { error } = await supabase
        .from("user_allowances")
        .insert({
          user_id, year, month,
          allowance_wife: 0, allowance_child: 0,
          deduction_loan: 0, deduction_pension: pension,
          updated_at: new Date().toISOString(),
        });
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[pension POST] exception:", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Server error" }, { status: 500 });
  }
}