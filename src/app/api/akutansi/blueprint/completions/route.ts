// src/app/api/akutansi/blueprint/completions/route.ts
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

// ── POST — tandai / batal selesai satu misi di satu hari (minggu berjalan) ──
// Body: { task_key: string; day: number (1-6); done: boolean }
export const POST = withAuth(async (req, _ctx, user: any) => {
  const body = await req.json();
  const { task_key, day, done, by } = body as { task_key: string; day: number; done: boolean; by?: string };

  if (!task_key?.trim())
    return NextResponse.json({ success: false, message: "task_key wajib diisi" }, { status: 400 });
  if (!Number.isInteger(day) || day < 1 || day > 6)
    return NextResponse.json({ success: false, message: "Hari tidak valid (1–6)" }, { status: 400 });

  const supabase = getAdmin();
  const weekKey = getWeekKey();

  if (done) {
    // Tandai selesai — idempoten; kalau sudah ada (task_key+day+week_key), update saja.
    const { error } = await supabase
      .from("accounting_blueprint_completions")
      .upsert(
              {
          task_key: task_key.trim(),
          day,
          week_key: weekKey,
          completed_by: user.id,
          completed_by_name: by?.trim() || null,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "task_key,day,week_key" }
      );
    if (error) {
      console.error("[blueprint completions upsert]", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
  } else {
    // Batal selesai — hapus barisnya.
    const { error } = await supabase
      .from("accounting_blueprint_completions")
      .delete()
      .eq("task_key", task_key.trim())
      .eq("day", day)
      .eq("week_key", weekKey);
    if (error) {
      console.error("[blueprint completions delete]", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, data: { weekKey } });
}, AKUNTANSI_ROLES);