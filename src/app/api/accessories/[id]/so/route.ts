// src/app/api/accessories/[id]/so/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { SO_ROLES, SO_LIMITED_USER_IDS, hasAnyRole } from "@/lib/permissions";

// ⚠️ GANTI SESUAI FIELD ASLI: cek bagaimana /api/accessories/[id]/audit
// mengambil nama user untuk `audited_by` — pakai pola yang sama persis di sini.
function resolveActorName(user: AuthUser): string {
    return (user as any).name ?? (user as any).email ?? user.id ?? "Unknown";
}

// ─── GET /api/accessories/[id]/so — riwayat SO aksesori ──────────────────────
export const GET = withAuth(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;

    const { data, error } = await supabaseAdmin
        .from("accessory_so_history")
        .select("*")
        .eq("accessory_id", id)
        .order("so_at", { ascending: false });

    if (error) {
        console.error("[GET /api/accessories/[id]/so]", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { history: data ?? [] } });
});

// ─── PATCH /api/accessories/[id]/so — tandai SO hari ini ─────────────────────
export const PATCH = withAuth(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }, user: AuthUser) => {
    const roles = user.roles ?? [user.role];
    const canManageSo = hasAnyRole(roles, SO_ROLES) || SO_LIMITED_USER_IDS.includes(user.id ?? "");
    if (!canManageSo) {
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const { id } = await ctx.params;
    if (!id) {
        return NextResponse.json({ success: false, message: "ID aksesori tidak valid" }, { status: 400 });
    }
    let body: { notes?: string } = {};
    try { body = await req.json(); } catch { /* body kosong tetap valid */ }

    const soAt = new Date().toISOString();
    const soBy = resolveActorName(user);

    const { data: updated, error: updateErr } = await supabaseAdmin
        .from("accessories")
        .update({ so_at: soAt, so_by: soBy })
        .eq("id", id)
        .select("so_at, so_by")
        .single();

    if (updateErr) {
        console.error("[PATCH /api/accessories/[id]/so] update", updateErr);
        return NextResponse.json({ success: false, message: updateErr.message }, { status: 500 });
    }

    const { error: histErr } = await supabaseAdmin.from("accessory_so_history").insert({
        accessory_id: id,
        action: "SO",
        so_by: soBy,
        so_at: soAt,
        notes: body.notes || null,
    });
    if (histErr) {
        // Update utama sudah sukses — riwayat gagal jangan bikin whole request gagal,
        // tapi tetap dilog supaya kelihatan kalau history tidak lengkap.
        console.error("[PATCH /api/accessories/[id]/so] history insert", histErr);
    }

    return NextResponse.json({ success: true, data: updated });
});