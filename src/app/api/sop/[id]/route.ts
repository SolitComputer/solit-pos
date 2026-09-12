// src/app/api/sop/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canManageSop, SOP_DIVISIONS, type SopDivision } from "@/lib/sop";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── PUT: edit SOP (hanya Admin) ──────────────────────────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
      { success: false, message: "Forbidden" },
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
      { success: false, message: "Semua field wajib diisi" },
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
    .update({
      sop_name: sop_name.trim(),
      description: description.trim(),
      division: division as SopDivision,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*, creator:users!sop_entries_created_by_fkey(name)")
    .single();

  if (error) {
    console.error("[PUT /api/sop/[id]] error:", error.message);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data });
}

// ── DELETE: hapus SOP (hanya Admin) ──────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
      { success: false, message: "Forbidden" },
      { status: 403 }
    );
  }

  const sb = supabase();
  const { error } = await sb.from("sop_entries").delete().eq("id", id);

  if (error) {
    console.error("[DELETE /api/sop/[id]] error:", error.message);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}