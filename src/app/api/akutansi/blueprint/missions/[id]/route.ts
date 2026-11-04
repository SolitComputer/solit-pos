// src/app/api/akutansi/blueprint/missions/[id]/route.ts
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

// ── PATCH — ganti nama / pasangin hari ──────────────────────────────────────
// Body: { nama?: string; day?: number|null }
export const PATCH = withAuth(async (req, ctx: any) => {
  const { id } = await ctx.params;
  if (!id)
    return NextResponse.json({ success: false, message: "ID misi tidak ditemukan" }, { status: 400 });

  const body = await req.json();
  const { nama, day } = body as { nama?: string; day?: number | null };
  const supabase = getAdmin();
  const patch: Record<string, unknown> = {};

  if (typeof nama === "string") {
    if (!nama.trim())
      return NextResponse.json({ success: false, message: "Nama tidak boleh kosong" }, { status: 400 });
    patch.nama = nama.trim();
  }

  if (day !== undefined) {
    const d = day === null ? null : Number(day);
    if (d !== null && (!Number.isInteger(d) || d < 0 || d > 6))
      return NextResponse.json({ success: false, message: "Hari tidak valid (0–6)" }, { status: 400 });
    if (d !== null) {
      await supabase.from("accounting_blueprint_missions").update({ day: null }).eq("day", d).neq("id", id);
    }
    patch.day = d;
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ success: false, message: "Tidak ada perubahan" }, { status: 400 });

  const { error } = await supabase.from("accounting_blueprint_missions").update(patch).eq("id", id);
  if (error) {
    console.error("[blueprint missions PATCH]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}, AKUNTANSI_MANAGE_ROLES);

// ── DELETE — hapus misi (rincian + centangnya ikut terhapus via cascade) ────
export const DELETE = withAuth(async (_req, ctx: any) => {
  const { id } = await ctx.params;
  if (!id)
    return NextResponse.json({ success: false, message: "ID misi tidak ditemukan" }, { status: 400 });

  const supabase = getAdmin();
  const { error } = await supabase.from("accounting_blueprint_missions").delete().eq("id", id);
  if (error) {
    console.error("[blueprint missions DELETE]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}, AKUNTANSI_MANAGE_ROLES);