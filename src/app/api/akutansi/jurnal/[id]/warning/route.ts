// src/app/api/akutansi/jurnal/[id]/warning/route.ts
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

// ── POST — aktifkan warning (wajib sertakan alasan) ─────────────────────────
export const POST = withAuth(async (req, ctx, user: any) => {
  // PENTING: di Next.js 15, ctx.params adalah Promise — wajib di-await,
  // kalau tidak, destructuring "id" akan selalu undefined.
  const { id } = await ctx.params;

  if (!id?.trim())
    return NextResponse.json({ success: false, message: "ID jurnal tidak valid" }, { status: 400 });

  const body = await req.json();
  const { reason } = body as { reason?: string };

  if (!reason?.trim())
    return NextResponse.json({ success: false, message: "Alasan warning wajib diisi" }, { status: 400 });

  const supabase = getAdmin();

  const { data: entry, error: findErr } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (findErr || !entry) {
    console.error("[jurnal warning POST find]", { id, findErr });
    return NextResponse.json({ success: false, message: "Jurnal tidak ditemukan" }, { status: 404 });
  }

  const { error: updateErr } = await supabase
    .from("journal_entries")
    .update({ has_warning: true })
    .eq("id", id);

  if (updateErr) {
    console.error("[jurnal warning POST update]", updateErr);
    return NextResponse.json({ success: false, message: updateErr.message }, { status: 500 });
  }

  const { error: logErr } = await supabase.from("journal_warning_logs").insert({
    entry_id: id,
    action: "ACTIVATE",
    reason: reason.trim(),
    created_by: user.id,
  });

  if (logErr) {
    console.error("[jurnal warning POST log]", logErr);
    return NextResponse.json({ success: false, message: logErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}, AKUNTANSI_MANAGE_ROLES);

// ── DELETE — nonaktifkan warning ────────────────────────────────────────────
export const DELETE = withAuth(async (req, ctx, user: any) => {
  const { id } = await ctx.params;

  if (!id?.trim())
    return NextResponse.json({ success: false, message: "ID jurnal tidak valid" }, { status: 400 });

  const supabase = getAdmin();

  const { data: entry, error: findErr } = await supabase
    .from("journal_entries")
    .select("id, has_warning")
    .eq("id", id)
    .maybeSingle();

  if (findErr || !entry) {
    console.error("[jurnal warning DELETE find]", { id, findErr });
    return NextResponse.json({ success: false, message: "Jurnal tidak ditemukan" }, { status: 404 });
  }

  if (!entry.has_warning)
    return NextResponse.json({ success: false, message: "Jurnal ini tidak sedang ditandai warning" }, { status: 400 });

  const { error: updateErr } = await supabase
    .from("journal_entries")
    .update({ has_warning: false })
    .eq("id", id);

  if (updateErr) {
    console.error("[jurnal warning DELETE update]", updateErr);
    return NextResponse.json({ success: false, message: updateErr.message }, { status: 500 });
  }

  const { error: logErr } = await supabase.from("journal_warning_logs").insert({
    entry_id: id,
    action: "DEACTIVATE",
    reason: null,
    created_by: user.id,
  });

  if (logErr) {
    console.error("[jurnal warning DELETE log]", logErr);
    return NextResponse.json({ success: false, message: logErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}, AKUNTANSI_MANAGE_ROLES);