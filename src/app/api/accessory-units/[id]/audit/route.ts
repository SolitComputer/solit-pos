// src/app/api/accessory-units/[id]/audit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { SO_ROLES, SO_LIMITED_USER_IDS, hasAnyRole } from "@/lib/permissions";

// Reset otomatis audit aksesoris per-unit: 3 hari (disamakan dengan
// ACCESSORY_AUDIT_TTL_MS di UnifiedBarangContent.tsx & audit model-level).
const AUDIT_TTL_MS = 3 * 24 * 60 * 60 * 1000;

// Samakan dengan cara /api/accessory-units/[id]/so mengambil nama actor,
// supaya audited_by konsisten di semua level.
function resolveActorName(user: AuthUser): string {
    return (user as any).name ?? (user as any).email ?? user.id ?? "Unknown";
}

// ─── GET /api/accessory-units/[id]/audit — status + riwayat audit unit ───────
export const GET = withAuth(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;

    // FIX: pakai maybeSingle() — kalau unit tidak ketemu, current = null TANPA
    // melempar error. Error pengambilan status unit TIDAK boleh menggagalkan
    // seluruh response, karena riwayat audit tetap harus tampil (dulu bug:
    // current error → success:false → history yang ADA di DB ikut tidak tampil).
    const { data: current } = await supabaseAdmin
        .from("accessory_units")
        .select("audited_at, audited_by")
        .eq("id", id)
        .maybeSingle();

    const { data: history, error: histErr } = await supabaseAdmin
        .from("accessory_unit_audit_history")
        .select("id, action, audited_by, audited_at, notes")
        .eq("accessory_unit_id", id)
        .order("audited_at", { ascending: false })
        .limit(20);

    if (histErr) {
        console.error("[GET /api/accessory-units/[id]/audit] history", histErr);
        // Walau history gagal dibaca, balas success dengan history kosong +
        // pesan — supaya modal tidak blank/crash, dan error-nya kelihatan di log.
        return NextResponse.json({ success: true, data: { current: current ?? null, history: [] }, warning: histErr.message });
    }

    return NextResponse.json({ success: true, data: { current: current ?? null, history: history ?? [] } });
});
// ─── PATCH /api/accessory-units/[id]/audit — toggle audit (tandai / batal) ───
export const PATCH = withAuth(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }, user: AuthUser) => {
    // Role sama dengan SO aksesoris (keputusan: samakan dengan SO).
    const roles = user.roles ?? [user.role];
    const canManage = hasAnyRole(roles, SO_ROLES) || SO_LIMITED_USER_IDS.includes(user.id ?? "");
    if (!canManage) {
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const { id } = await ctx.params;
    if (!id) {
        return NextResponse.json({ success: false, message: "ID unit tidak valid" }, { status: 400 });
    }
    let body: { notes?: string } = {};
    try { body = await req.json(); } catch { /* body opsional */ }

    // Baca status audit sekarang → toggle. Aktif (< 3 hari) = batal; selain itu = tandai.
    const { data: current, error: readErr } = await supabaseAdmin
        .from("accessory_units")
        .select("id, audited_at, audited_by")
        .eq("id", id)
        .single();

    if (readErr || !current) {
        return NextResponse.json(
            { success: false, message: readErr?.message || "Unit tidak ditemukan" },
            { status: 404 }
        );
    }

    const isActive =
        current.audited_at != null &&
        Date.now() - new Date(current.audited_at).getTime() < AUDIT_TTL_MS;

    const nowIso = new Date().toISOString();
    const actor = resolveActorName(user);
    const payload = isActive
        ? { audited_at: null, audited_by: null }
        : { audited_at: nowIso, audited_by: actor };

    const { data: updated, error: updateErr } = await supabaseAdmin
        .from("accessory_units")
        .update(payload)
        .eq("id", id)
        .select("audited_at, audited_by")
        .single();

    if (updateErr) {
        console.error("[PATCH /api/accessory-units/[id]/audit] update", updateErr);
        return NextResponse.json({ success: false, message: updateErr.message }, { status: 500 });
    }

    // Riwayat permanen — tidak ikut ter-reset walau status "aktif" lewat TTL.
    const { error: histErr } = await supabaseAdmin.from("accessory_unit_audit_history").insert({
        accessory_unit_id: id,
        action: isActive ? "UNAUDIT" : "AUDIT",
        audited_by: actor,
        audited_at: nowIso,
        notes: body.notes || null,
    });
    if (histErr) {
        // Update utama sudah sukses — riwayat gagal tidak membatalkan audit.
        console.error("[PATCH /api/accessory-units/[id]/audit] history insert", histErr);
    }

    return NextResponse.json({ success: true, data: updated });
});