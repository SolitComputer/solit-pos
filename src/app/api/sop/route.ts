// src/app/api/sop/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getUserSopDivisions,
  canManageSop,
  SOP_DIVISIONS,
  type SopDivision,
} from "@/lib/sop";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── GET: ambil daftar SOP (difilter per divisi user) ─────────────────────────
export async function GET(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userRoles = (request.headers.get("x-user-roles") || "")
    .split(",")
    .filter(Boolean);

  if (!userId) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  const divisions = getUserSopDivisions(userRoles);

  const sb = supabase();
  let query = sb
    .from("sop_entries")
    .select("*, creator:users!sop_entries_created_by_fkey(name)")
    .order("division")
    .order("created_at", { ascending: false });

  // Non-admin: filter hanya divisi user
  if (divisions !== "all") {
    if (divisions.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        canManage: false,
        userDivisions: [],
      });
    }
    query = query.in("division", divisions);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[GET /api/sop] error:", error.message);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: data ?? [],
    canManage: canManageSop(userRoles),
    userDivisions: divisions,
  });
}

// ── POST: buat SOP baru (hanya Admin) ────────────────────────────────────────
export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  const userRoles = (request.headers.get("x-user-roles") || "")
    .split(",")
    .filter(Boolean);

  if (!userId) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!canManageSop(userRoles)) {
    return NextResponse.json(
      { success: false, message: "Forbidden: hanya Admin yang bisa membuat SOP" },
      { status: 403 }
    );
  }

  let body: { sop_name?: string; description?: string; division?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON tidak valid" },
      { status: 400 }
    );
  }

  const { sop_name, description, division } = body;

  if (!sop_name?.trim() || !description?.trim() || !division) {
    return NextResponse.json(
      { success: false, message: "Nama SOP, penjelasan, dan divisi wajib diisi" },
      { status: 400 }
    );
  }

  if (!(SOP_DIVISIONS as readonly string[]).includes(division)) {
    return NextResponse.json(
      { success: false, message: "Divisi tidak valid" },
      { status: 400 }
    );
  }

  const sb = supabase();
  const { data, error } = await sb
    .from("sop_entries")
    .insert({
      sop_name: sop_name.trim(),
      description: description.trim(),
      division: division as SopDivision,
      created_by: userId,
    })
    .select("*, creator:users!sop_entries_created_by_fkey(name)")
    .single();

  if (error) {
    console.error("[POST /api/sop] error:", error.message);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data });
}