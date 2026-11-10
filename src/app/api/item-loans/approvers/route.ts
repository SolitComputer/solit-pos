// src/app/api/item-loans/approvers/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { LOAN_APPROVER_MANAGE_ROLES, ITEM_LOAN_APPROVE_ROLES, hasAnyRole } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

// ═══════════════════════════════════════════════════════════════════════
// GET /api/item-loans/approvers
// ═══════════════════════════════════════════════════════════════════════
// Return list approver aktif + daftar user yang BISA dipilih (untuk UI).
// Dipanggil dari:
//   - /dashboard/item-loans/approvers (admin UI)
//   - /dashboard/item-loans (untuk cek is_strict & canApprove per user)
async function getHandler(_req: NextRequest, _ctx: unknown, user: AuthUser) {
  try {
    // 1. List approver aktif
    const { data: approvers, error: appErr } = await supabaseAdmin
      .from("loan_approvers")
      .select("id, user_id, added_by, added_at, note")
      .eq("is_active", true);

    if (appErr) {
      return NextResponse.json({ success: false, message: appErr.message }, { status: 400 });
    }

    const approverIds = (approvers ?? []).map(a => a.user_id);
    const addedByIds = (approvers ?? []).map(a => a.added_by).filter(Boolean) as string[];
    const allUserIds = Array.from(new Set([...approverIds, ...addedByIds]));

    // 2. Ambil nama user approver + added_by
    const userMap = new Map<string, { id: string; name: string; role: string }>();
    if (allUserIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from("users").select("id, name, role").in("id", allUserIds);
      (users ?? []).forEach(u => userMap.set(u.id, u));
    }

    const approversEnriched = (approvers ?? []).map(a => ({
      id: a.id,
      user_id: a.user_id,
      user_name: userMap.get(a.user_id)?.name ?? "Unknown",
      user_role: userMap.get(a.user_id)?.role ?? "",
      added_at: a.added_at,
      added_by_name: a.added_by ? (userMap.get(a.added_by)?.name ?? "—") : "—",
      note: a.note,
    }));

    // 3. is_strict = true kalau list > 0 → enforce whitelist; false → fallback role
    const isStrict = approversEnriched.length > 0;

    // 4. canApproveNow — info untuk client supaya UI bisa hide tombol kalau user gak eligible
    let canApproveNow = false;
    if (isStrict) {
      canApproveNow = approverIds.includes(user.id);
    } else {
      // Grace period: belum ada setup → fallback role check
      const userRoles = user.roles ?? [user.role];
      canApproveNow = hasAnyRole(userRoles, ITEM_LOAN_APPROVE_ROLES);
    }

    return NextResponse.json({
      success: true,
      data: {
        approvers: approversEnriched,
        count: approversEnriched.length,
        is_strict: isStrict,
        can_approve_now: canApproveNow,
      },
    });
  } catch (err) {
    console.error("[approvers GET]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// POST /api/item-loans/approvers
// ═══════════════════════════════════════════════════════════════════════
// Body: { action: "ADD" | "REMOVE", user_id: string, note?: string }
// Add → insert row baru dengan is_active=true (atau reactivate kalau row lama ada)
// Remove → set is_active=false + isi removed_at/removed_by
async function postHandler(req: NextRequest, _ctx: unknown, user: AuthUser) {
  try {
    const { action, user_id, note } = await req.json();

    if (!action || !user_id || !["ADD", "REMOVE"].includes(action)) {
      return NextResponse.json({
        success: false, message: "action (ADD/REMOVE) & user_id wajib diisi",
      }, { status: 400 });
    }

    // Validasi: user_id harus exists
    const { data: targetUser } = await supabaseAdmin
      .from("users").select("id, name").eq("id", user_id).single();
    if (!targetUser) {
      return NextResponse.json({ success: false, message: "User target tidak ditemukan" }, { status: 404 });
    }

    const nowIso = new Date().toISOString();

    if (action === "ADD") {
      // Cek apakah user sudah di whitelist aktif
      const { data: existing } = await supabaseAdmin
        .from("loan_approvers")
        .select("id").eq("user_id", user_id).eq("is_active", true).limit(1);
      if (existing && existing.length > 0) {
        return NextResponse.json({
          success: false, message: `${targetUser.name} sudah menjadi approver aktif`,
        }, { status: 409 });
      }

      const { error: insErr } = await supabaseAdmin.from("loan_approvers").insert({
        user_id, added_by: user.id, added_at: nowIso, is_active: true,
        note: note?.trim() || null,
      });
      if (insErr) return NextResponse.json({ success: false, message: insErr.message }, { status: 400 });

      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "CREATE", entity: "item_loan", entityId: user_id,
        entityLabel: `Approver ditambah: ${targetUser.name}`,
      });

      return NextResponse.json({ success: true, action: "ADD", target_name: targetUser.name });
    }

    // REMOVE → soft delete (is_active=false)
    const { error: updErr } = await supabaseAdmin.from("loan_approvers").update({
      is_active: false, removed_at: nowIso, removed_by: user.id,
    }).eq("user_id", user_id).eq("is_active", true);

    if (updErr) return NextResponse.json({ success: false, message: updErr.message }, { status: 400 });

    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: "DELETE", entity: "item_loan", entityId: user_id,
      entityLabel: `Approver dihapus: ${targetUser.name}`,
    });

    return NextResponse.json({ success: true, action: "REMOVE", target_name: targetUser.name });
  } catch (err) {
    console.error("[approvers POST]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// GET: semua role yang bisa view item-loans (karena perlu tahu "can_approve_now")
// POST: hanya LOAN_APPROVER_MANAGE_ROLES yang bisa add/remove
export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler, LOAN_APPROVER_MANAGE_ROLES);