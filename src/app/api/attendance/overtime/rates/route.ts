// src/app/api/attendance/overtime/rates/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RATE_MANAGERS = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
];

// GET — ambil semua rates
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { data, error } = await supabase
      .from("overtime_rates")
      .select("id, role, rate_per_hour, updated_at")
      .order("role");

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}

// POST — set rate per jam untuk role tertentu
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !RATE_MANAGERS.includes(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const body = await request.json();
    const { role, rate_per_hour } = body;

    if (!role || rate_per_hour === undefined) {
      return NextResponse.json({ success: false, message: "role dan rate_per_hour wajib" }, { status: 400 });
    }

    if (typeof rate_per_hour !== "number" || rate_per_hour < 0) {
      return NextResponse.json({ success: false, message: "rate_per_hour harus angka positif" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("overtime_rates")
      .upsert({ role, rate_per_hour, created_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "role" })
      .select()
      .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}