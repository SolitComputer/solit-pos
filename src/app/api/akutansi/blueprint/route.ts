// src/app/api/akutansi/blueprint/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES, AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── GET — semua misi + rincian + status centang ─────────────────────────────
export const GET = withAuth(async () => {
  const supabase = getAdmin();

  const [missionsRes, itemsRes, checksRes] = await Promise.all([
    supabase
      .from("accounting_blueprint_missions")
      .select("id, nama, day, position")
      .order("position", { ascending: true }),
    supabase
      .from("accounting_blueprint_items")
      .select("id, mission_id, keterangan, position")
      .order("position", { ascending: true }),
    supabase.from("accounting_blueprint_checks").select("item_id, checked_by_name"),
  ]);

  for (const r of [missionsRes, itemsRes, checksRes]) {
    if (r.error) {
      console.error("[blueprint GET]", r.error);
      return NextResponse.json({ success: false, message: r.error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      missions: missionsRes.data ?? [],
      items: itemsRes.data ?? [],
      checks: checksRes.data ?? [],
    },
  });
}, AKUNTANSI_ROLES);

// ── POST — buat misi baru (manage saja) ─────────────────────────────────────
// Body: { nama: string; day?: number|null (0-6) }
export const POST = withAuth(async (req, _ctx, user: any) => {
  const body = await req.json();
  const { nama, day } = body as { nama: string; day?: number | null };

  if (!nama?.trim())
    return NextResponse.json({ success: false, message: "Nama misi wajib diisi" }, { status: 400 });

  const d = day === null || day === undefined ? null : Number(day);
  if (d !== null && (!Number.isInteger(d) || d < 0 || d > 6))
    return NextResponse.json({ success: false, message: "Hari tidak valid (0–6)" }, { status: 400 });

  const supabase = getAdmin();

  // 1 hari = 1 misi: kalau dipasangin ke suatu hari, lepas misi lain di hari itu.
  if (d !== null) {
    await supabase.from("accounting_blueprint_missions").update({ day: null }).eq("day", d);
  }

  const { data: inserted, error } = await supabase
    .from("accounting_blueprint_missions")
    .insert({ nama: nama.trim(), day: d, position: Date.now(), created_by: user.id })
    .select("id, nama, day, position")
    .single();

  if (error) {
    console.error("[blueprint missions POST]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: inserted }, { status: 201 });
}, AKUNTANSI_MANAGE_ROLES);