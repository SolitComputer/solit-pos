// src/app/api/violations/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { hasAnyRole, VIOLATION_MANAGE_ROLES, VIOLATION_WARNING_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { VIOLATION_POINTS, bumpSeverity } from "@/lib/violation-points";

async function patchHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { id } = await ctx.params; // aman utk params object maupun Promise (Next 15)
  const roles = user.roles ?? [user.role];
  const body = await req.json().catch(() => ({} as any));
  const action = body.action as string;
  const nowIso = new Date().toISOString();

  const { data: kase, error: findErr } = await supabaseAdmin
    .from("violation_cases").select("*").eq("id", id).maybeSingle();
  if (findErr) return NextResponse.json({ success: false, message: findErr.message }, { status: 500 });
  if (!kase) return NextResponse.json({ success: false, message: "Kasus tidak ditemukan" }, { status: 404 });

  // ── Tetapkan pelaku (termasuk "ketahuan belakangan") ──
  if (action === "assign") {
    if (!hasAnyRole(roles, VIOLATION_MANAGE_ROLES))
      return NextResponse.json({ success: false, message: "Hanya Admin yang bisa menetapkan pelaku" }, { status: 403 });
    if (kase.severity === "SANGAT_BERAT")
      return NextResponse.json({ success: false, message: "Sangat Berat ditangani lewat PHK, bukan tetapkan pelaku" }, { status: 400 });

    const pelaku: string[] = Array.isArray(body.pelaku_ids) ? body.pelaku_ids.filter(Boolean) : [];
    if (pelaku.length === 0)
      return NextResponse.json({ success: false, message: "Pilih minimal 1 pelaku" }, { status: 400 });

    // Ketahuan diam-diam belakangan (kasus sudah lewat masa tenang / di-escalate /
    // sudah ditegur) → naik 1 tingkat.
    const discoveredLate = ["PERLU_TINDAKAN_ATASAN", "SELESAI_TEGURAN"].includes(kase.status);
    const effSeverity = discoveredLate ? bumpSeverity(kase.severity) : kase.severity;
    const points = VIOLATION_POINTS[effSeverity];

    const d = new Date(`${kase.incident_date}T00:00:00Z`);
    const pYear = d.getUTCFullYear();
    const pMonth = d.getUTCMonth() + 1;

    // Nonaktifkan penalti lama kasus ini (kalau ada) biar tidak dobel saat re-assign.
    await supabaseAdmin.from("violation_penalties").update({ active: false }).eq("case_id", id);

    const rows = pelaku.map((uid) => ({
      case_id: id, user_id: uid, year: pYear, month: pMonth,
      points_deducted: points, severity_applied: effSeverity, active: true,
    }));
    const { error: penErr } = await supabaseAdmin.from("violation_penalties").insert(rows);
    if (penErr) return NextResponse.json({ success: false, message: penErr.message }, { status: 500 });

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("violation_cases")
      .update({ status: "PENALTI_BERJALAN", hidden_discovery: discoveredLate || kase.hidden_discovery, updated_at: nowIso })
      .eq("id", id).select("*").single();
    if (upErr) return NextResponse.json({ success: false, message: upErr.message }, { status: 500 });

    return NextResponse.json({ success: true, data: updated, bumped: discoveredLate, appliedSeverity: effSeverity });
  }

  // ── Batalkan kasus → poin balik otomatis (active=false) ──
  if (action === "cancel") {
    if (!hasAnyRole(roles, VIOLATION_MANAGE_ROLES))
      return NextResponse.json({ success: false, message: "Hanya Admin yang bisa membatalkan pelanggaran" }, { status: 403 });

    await supabaseAdmin.from("violation_penalties").update({ active: false }).eq("case_id", id);
    const { data: updated, error: upErr } = await supabaseAdmin
      .from("violation_cases").update({ status: "DIBATALKAN", updated_at: nowIso })
      .eq("id", id).select("*").single();
    if (upErr) return NextResponse.json({ success: false, message: upErr.message }, { status: 500 });
    return NextResponse.json({ success: true, data: updated });
  }

  // ── Tandai teguran sudah dikirim (atasan; pengiriman WA manual di luar sistem) ──
  if (action === "teguran") {
    if (!hasAnyRole(roles, VIOLATION_WARNING_ROLES))
      return NextResponse.json({ success: false, message: "Hanya atasan yang bisa menandai teguran" }, { status: 403 });
    if (kase.status !== "PERLU_TINDAKAN_ATASAN")
      return NextResponse.json({ success: false, message: "Teguran hanya untuk kasus berstatus Perlu Tindakan Atasan" }, { status: 400 });

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("violation_cases")
      .update({
        status: "SELESAI_TEGURAN",
        warning_sent_at: nowIso,
        warning_sent_by: user.id,
        warning_message: body.warning_message ?? null, // isi teks teguran (audit)
        warning_target: body.warning_target ?? null,   // label grup/divisi tujuan (audit)
        updated_at: nowIso,
      })
      .eq("id", id).select("*").single();
    if (upErr) return NextResponse.json({ success: false, message: upErr.message }, { status: 500 });
    return NextResponse.json({ success: true, data: updated });
  }

  return NextResponse.json({ success: false, message: "Action tidak dikenal" }, { status: 400 });
}

export const PATCH = withAuth(patchHandler);