// src/app/api/akutansi/blueprint/items/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── POST — tambah rincian (to-do) ke sebuah misi ────────────────────────────
// Body: { mission_id: string; keterangan: string }
export const POST = withAuth(async (req) => {
  const body = await req.json();
  const { mission_id, keterangan } = body as { mission_id: string; keterangan: string };

  if (!mission_id?.trim())
    return NextResponse.json({ success: false, message: "mission_id wajib diisi" }, { status: 400 });
  if (!keterangan?.trim())
    return NextResponse.json({ success: false, message: "Rincian wajib diisi" }, { status: 400 });

  const supabase = getAdmin();
  const { data: inserted, error } = await supabase
    .from("accounting_blueprint_items")
    .insert({ mission_id, keterangan: keterangan.trim(), position: Date.now() })
    .select("id, mission_id, keterangan, position")
    .single();

  if (error) {
    console.error("[blueprint items POST]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: inserted }, { status: 201 });
}, AKUNTANSI_MANAGE_ROLES);