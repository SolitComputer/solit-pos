// src/app/api/akutansi/blueprint/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getWeekKey } from "@/lib/blueprint";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── GET — misi tambahan (aktif) + status selesai minggu berjalan ────────────
export const GET = withAuth(async () => {
  const supabase = getAdmin();
  const weekKey = getWeekKey();

  const [tasksRes, doneRes] = await Promise.all([
    supabase
      .from("accounting_blueprint_tasks")
      .select("id, keterangan, days, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("accounting_blueprint_completions")
      .select("task_key, day")
      .eq("week_key", weekKey),
  ]);

  if (tasksRes.error) {
    console.error("[blueprint GET tasks]", tasksRes.error);
    return NextResponse.json({ success: false, message: tasksRes.error.message }, { status: 500 });
  }
  if (doneRes.error) {
    console.error("[blueprint GET completions]", doneRes.error);
    return NextResponse.json({ success: false, message: doneRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: { weekKey, tasks: tasksRes.data ?? [], completions: doneRes.data ?? [] },
  });
}, AKUNTANSI_ROLES);

// ── POST — tambah misi tambahan (custom) ────────────────────────────────────
export const POST = withAuth(async (req, _ctx, user: any) => {
  const body = await req.json();
  const { keterangan, days } = body as { keterangan: string; days: number[] };

  if (!keterangan?.trim())
    return NextResponse.json({ success: false, message: "Keterangan misi wajib diisi" }, { status: 400 });

  // Bersihkan: unik, hanya hari kerja 1–6, urut.
  const cleanDays = Array.isArray(days)
    ? [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 1 && d <= 6).sort((a, b) => a - b)
    : [];
  if (cleanDays.length === 0)
    return NextResponse.json({ success: false, message: "Pilih minimal 1 hari (Senin–Sabtu)" }, { status: 400 });

  const supabase = getAdmin();
  const { data: inserted, error } = await supabase
    .from("accounting_blueprint_tasks")
    .insert({ keterangan: keterangan.trim(), days: cleanDays, is_active: true, created_by: user.id })
    .select("id, keterangan, days, created_at")
    .single();

  if (error) {
    console.error("[blueprint POST]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: inserted }, { status: 201 });
}, AKUNTANSI_ROLES);