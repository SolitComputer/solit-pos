import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth, AuthUser } from "@/lib/auth";
import {
  PREPARATION_DISPATCH_ROLES,
  PREPARATION_DONE_ROLES,
  PREPARATION_DELIVERY_PERSON_ROLES,
} from "@/lib/permissions";

// Admin client — bypass RLS, sama seperti di history/route.ts
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Yang boleh ambil daftar pengantar = dispatch (Sales) + done (Penyedia) + Admin
const ASSIGN_DRIVER_ROLES = [
  ...new Set([...PREPARATION_DISPATCH_ROLES, ...PREPARATION_DONE_ROLES]),
];

async function getHandler(_req: NextRequest, _ctx: any, _user: AuthUser) {
  try {
    const { data, error } = await admin
      .from("users")
      .select("id, name, role")
      .in("role", PREPARATION_DELIVERY_PERSON_ROLES)
      .order("name", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err) {
    console.error("[GET /api/preparation/delivery-users]", err);
    return NextResponse.json({ success: false, message: "Gagal mengambil daftar pengantar" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, ASSIGN_DRIVER_ROLES);