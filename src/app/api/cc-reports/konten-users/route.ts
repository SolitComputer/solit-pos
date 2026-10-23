// src/app/api/cc-reports/konten-users/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";

export const dynamic = "force-dynamic";

// Role yang dianggap "divisi Konten Kreator" untuk dropdown
// Videographer / Talent / Editor. Tinggal tambah/kurangi di sini.
const KONTEN_ROLES = ["KONTEN", "PKL_KONTEN", "KEPALA_CC"] as const;

// GET /api/cc-reports/konten-users → daftar user divisi Konten untuk dropdown
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, name, role")
    .in("role", KONTEN_ROLES as unknown as string[])
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    users: (data ?? []).map((u) => ({ id: u.id, name: u.name, role: u.role })),
  });
}