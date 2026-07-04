// src/app/api/missions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { canAssignToTarget, isMissionFullAccess } from "@/lib/missions";

const SELECT = `
  id, title, description, status, priority, due_date,
  proof_photo_url, proof_note, submitted_at, reviewed_at,
  rejection_reason, created_at, updated_at,
  assigned_by, assigned_to,
  assigner:users!missions_assigned_by_fkey(id, name, role, roles),
  assignee:users!missions_assigned_to_fkey(id, name, role, roles),
  reviewer:users!missions_reviewed_by_fkey(id, name),
  items:mission_items(id, mission_id, text, is_done, done_at, sort_order)
`;

const VALID_STATUS = ["PENDING", "IN_PROGRESS", "SUBMITTED", "REJECTED", "APPROVED"];
const VALID_PRIORITY = ["LOW", "MEDIUM", "HIGH"];

// ── GET — list misi dengan pagination + filter ──────────────────────────────
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const roles = user.roles ?? [user.role];
  const url = new URL(req.url);
  const sp = url.searchParams;

  const box = sp.get("box") ?? "received";
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "20", 10) || 20));
  const search = sp.get("search")?.trim() ?? "";
  const status = sp.get("status");
  const priority = sp.get("priority");
  const assignerId = sp.get("assigner_id");
  const assigneeId = sp.get("assignee_id");
  const dateFrom = sp.get("from");
  const dateTo = sp.get("to");
  const dateBasis = sp.get("date_basis") === "due" ? "due_date" : "created_at";

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Base query dgn count exact biar bisa hitung total
  let query = supabaseAdmin
    .from("missions")
    .select(SELECT, { count: "exact" });

  // ── Scope berdasarkan box ──
  if (box === "assigned") {
    query = query.eq("assigned_by", user.id);
  } else if (box === "all") {
    // Hanya full access yg bisa akses "all" (lihat semua misi seluruh org)
    if (!isMissionFullAccess(roles)) {
      return NextResponse.json(
        { success: false, message: "Kamu tidak berwenang melihat semua misi" },
        { status: 403 }
      );
    }
    // no additional scope — admin lihat semua
  } else {
    // default "received"
    query = query.eq("assigned_to", user.id);
  }

  // ── Filter tambahan ──
  if (status && VALID_STATUS.includes(status)) query = query.eq("status", status);
  if (priority && VALID_PRIORITY.includes(priority)) query = query.eq("priority", priority);
  if (assignerId) query = query.eq("assigned_by", assignerId);
  if (assigneeId) query = query.eq("assigned_to", assigneeId);
  if (dateFrom) query = query.gte(dateBasis, dateFrom);
  if (dateTo) query = query.lte(dateBasis, dateTo);

  // Search — cari di title & description (case-insensitive)
  if (search) {
    // Escape karakter khusus PostgREST (,) biar aman
    const safe = search.replace(/[,()]/g, " ");
    query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
  }

  // Sort + pagination
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error("[missions GET]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const total = count ?? 0;
  const hasMore = from + (data?.length ?? 0) < total;

  return NextResponse.json({
    success: true,
    data: data ?? [],
    total,
    page,
    limit,
    hasMore,
  });
}

// POST tetap sama seperti yang kamu punya — tidak perlu diubah
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const roles = user.roles ?? [user.role];

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 }); }

  const { assigned_to, title, description, priority = "MEDIUM", due_date, items } = body;

  if (!assigned_to || !title?.trim()) {
    return NextResponse.json({ success: false, message: "Penerima & judul misi wajib diisi" }, { status: 400 });
  }
  if (!["LOW", "MEDIUM", "HIGH"].includes(priority)) {
    return NextResponse.json({ success: false, message: "Prioritas tidak valid" }, { status: 400 });
  }

  const { data: target, error: targetErr } = await supabaseAdmin
    .from("users").select("id, name, role, roles, is_active").eq("id", assigned_to).maybeSingle();

  if (targetErr || !target)
    return NextResponse.json({ success: false, message: "User penerima tidak ditemukan" }, { status: 404 });
  if (target.is_active === false)
    return NextResponse.json({ success: false, message: "User penerima non-aktif" }, { status: 400 });

  const targetRoles: string[] =
    Array.isArray(target.roles) && target.roles.length > 0 ? target.roles : [target.role];

  if (!canAssignToTarget(roles, targetRoles)) {
    return NextResponse.json({ success: false, message: "Kamu tidak berwenang memberi misi ke user ini" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("missions")
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      assigned_by: user.id,
      assigned_to,
      priority,
      due_date: due_date || null,
      status: "PENDING",
    })
    .select("id").single();

  if (error) {
    console.error("[missions POST]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  if (Array.isArray(items) && items.length > 0) {
    const rows = items
      .map((t: any, i: number) => ({ mission_id: data.id, text: String(t ?? "").trim(), sort_order: i }))
      .filter((r: { text: string }) => r.text.length > 0);

    if (rows.length > 0) {
      const { error: itemsErr } = await supabaseAdmin.from("mission_items").insert(rows);
      if (itemsErr) {
        await supabaseAdmin.from("missions").delete().eq("id", data.id);
        console.error("[missions POST items]", itemsErr);
        return NextResponse.json({ success: false, message: itemsErr.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ success: true, id: data.id });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);