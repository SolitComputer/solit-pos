// src/app/api/violations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { hasAnyRole, VIOLATION_MANAGE_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { getViolationNetBoard, VIOLATION_POINTS } from "@/lib/violation-points";

// 3 jenis pelanggaran tetap — HARUS sinkron dgn VIOLATION_TYPES di page.tsx.
// Divalidasi di server supaya tidak bisa dibypass lewat API langsung.
const VIOLATION_TYPES = ["Tempat barang salah", "Kebersihan dan kerapian", "Disiplin kerja"] as const;

function wibNow() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

// GET ?list=true&year=&month=   -> net board (poin akhir) utk tab Pelanggaran
// GET ?year=&month=&status=     -> daftar kasus bulan itu (+ pelaku & nama)
async function getHandler(req: NextRequest, _ctx: any, _user: AuthUser) {
  const { searchParams } = new URL(req.url);
  const now = wibNow();
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  const year = parseInt(searchParams.get("year") || String(nowYear), 10);
  const month = parseInt(searchParams.get("month") || String(nowMonth), 10);

  // Lazy transition: MENUNGGU_PENGAKUAN yg lewat masa tenang 3 hari → PERLU_TINDAKAN_ATASAN.
  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from("violation_cases")
    .update({ status: "PERLU_TINDAKAN_ATASAN", escalated_at: nowIso, updated_at: nowIso })
    .eq("status", "MENUNGGU_PENGAKUAN")
    .lt("quiet_period_ends_at", nowIso);

  if (searchParams.get("list") === "true") {
    const board = await getViolationNetBoard(year, month);
    return NextResponse.json({
      success: true,
      data: board,
      isOngoingMonth: year === nowYear && month === nowMonth,
    });
  }

  // Daftar kasus: filter incident_date dalam bulan ybs.
  const pad = (n: number) => String(n).padStart(2, "0");
  const first = `${year}-${pad(month)}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${year}-${pad(month)}-${pad(lastDay)}`;

  const statusFilter = searchParams.get("status");
  let q = supabaseAdmin
    .from("violation_cases")
    .select("*")
    .gte("incident_date", first)
    .lte("incident_date", last)
    .order("created_at", { ascending: false });
  if (statusFilter) q = q.eq("status", statusFilter);

  const { data: cases, error } = await q;
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  const caseIds = (cases ?? []).map((c) => c.id);
  const { data: penalties } = await supabaseAdmin
    .from("violation_penalties")
    .select("id, case_id, user_id, points_deducted, severity_applied, active, year, month")
    .in("case_id", caseIds.length ? caseIds : ["00000000-0000-0000-0000-000000000000"]);

  // Nama utk pelaku + pelapor + penegur.
  const userIds = new Set<string>();
  (penalties ?? []).forEach((p) => userIds.add(p.user_id));
  (cases ?? []).forEach((c) => {
    if (c.reported_by) userIds.add(c.reported_by);
    if (c.warning_sent_by) userIds.add(c.warning_sent_by);
  });
  const idArr = [...userIds];
  const { data: users } = await supabaseAdmin
    .from("users").select("id, name, role")
    .in("id", idArr.length ? idArr : ["00000000-0000-0000-0000-000000000000"]);
  const umap = new Map((users ?? []).map((u) => [u.id, u]));

  const penByCase = new Map<string, any[]>();
  (penalties ?? []).forEach((p) => {
    if (!penByCase.has(p.case_id)) penByCase.set(p.case_id, []);
    penByCase.get(p.case_id)!.push({
      ...p,
      name: umap.get(p.user_id)?.name ?? "Unknown",
      role: umap.get(p.user_id)?.role ?? "",
    });
  });

  const data = (cases ?? []).map((c) => ({
    ...c,
    reported_by_name: c.reported_by ? (umap.get(c.reported_by)?.name ?? null) : null,
    warning_sent_by_name: c.warning_sent_by ? (umap.get(c.warning_sent_by)?.name ?? null) : null,
    penalties: penByCase.get(c.id) ?? [],
  }));

  return NextResponse.json({
    success: true,
    data,
    isOngoingMonth: year === nowYear && month === nowMonth,
  });
}

// POST — buat kasus. Admin only.
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const roles = user.roles ?? [user.role];
  if (!hasAnyRole(roles, VIOLATION_MANAGE_ROLES)) {
    return NextResponse.json({ success: false, message: "Hanya Admin yang bisa menambah pelanggaran" }, { status: 403 });
  }

  const body = await req.json();
  const { violation_type, severity, area, shift, incident_date, reason, division, pelaku_ids, confirm_phk } = body;

  if (!violation_type || !severity || !incident_date || !reason) {
    return NextResponse.json({ success: false, message: "Jenis, kategori, tanggal, dan alasan wajib diisi" }, { status: 400 });
  }
  if (!["RINGAN", "SEDANG", "BERAT", "SANGAT_BERAT"].includes(severity)) {
    return NextResponse.json({ success: false, message: "Kategori tidak valid" }, { status: 400 });
  }
  if (!(VIOLATION_TYPES as readonly string[]).includes(violation_type)) {
    return NextResponse.json({ success: false, message: "Jenis pelanggaran tidak valid" }, { status: 400 });
  }

  const pelaku: string[] = Array.isArray(pelaku_ids) ? pelaku_ids.filter(Boolean) : [];

  // Berat & Sangat Berat wajib ada pelaku jelas (tidak boleh teguran kolektif).
  if ((severity === "BERAT" || severity === "SANGAT_BERAT") && pelaku.length === 0) {
    return NextResponse.json({ success: false, message: "Pelanggaran Berat & Sangat Berat wajib menyertakan pelaku yang jelas" }, { status: 400 });
  }

  const d = new Date(`${incident_date}T00:00:00Z`);
  const pYear = d.getUTCFullYear();
  const pMonth = d.getUTCMonth() + 1;
  const nowIso = new Date().toISOString();

  // ── SANGAT BERAT = PHK (bukan potong poin) ──
  if (severity === "SANGAT_BERAT") {
    if (confirm_phk !== true) {
      return NextResponse.json(
        { success: false, need_confirm: true, message: "PHK bersifat permanen & tak bisa dibatalkan. Konfirmasi ulang untuk melanjutkan." },
        { status: 409 }
      );
    }
    const { data: created, error: insErr } = await supabaseAdmin
      .from("violation_cases")
      .insert({
        violation_type, severity, area: area ?? null, shift: shift ?? null,
        incident_date, reason, division: division ?? null,
        status: "PHK", reported_by: user.id,
      })
      .select("*").single();
    if (insErr) return NextResponse.json({ success: false, message: insErr.message }, { status: 500 });

    // Nonaktifkan akun pelaku (pola sama dgn _toggleActive=false di /api/users).
    const { error: offErr } = await supabaseAdmin
      .from("users")
      .update({ is_active: false, deactivated_at: nowIso, deactivated_by: user.id, force_logout_at: nowIso })
      .in("id", pelaku);
    if (offErr) {
      return NextResponse.json({ success: false, message: `Kasus dibuat, tapi gagal menonaktifkan akun: ${offErr.message}` }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: created, phk: true });
  }

  // ── RINGAN / SEDANG / BERAT ──
  const hasPelaku = pelaku.length > 0;
  const status = hasPelaku ? "PENALTI_BERJALAN" : "MENUNGGU_PENGAKUAN";
  const quietEnds = hasPelaku ? null : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: created, error: insErr } = await supabaseAdmin
    .from("violation_cases")
    .insert({
      violation_type, severity, area: area ?? null, shift: shift ?? null,
      incident_date, reason, division: division ?? null,
      status, reported_by: user.id, quiet_period_ends_at: quietEnds,
    })
    .select("*").single();
  if (insErr) return NextResponse.json({ success: false, message: insErr.message }, { status: 500 });

  if (hasPelaku) {
    const points = VIOLATION_POINTS[severity];
    const rows = pelaku.map((uid) => ({
      case_id: created.id, user_id: uid, year: pYear, month: pMonth,
      points_deducted: points, severity_applied: severity, active: true,
    }));
    const { error: penErr } = await supabaseAdmin.from("violation_penalties").insert(rows);
    if (penErr) return NextResponse.json({ success: false, message: `Kasus dibuat, tapi gagal mencatat potongan: ${penErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: created });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);