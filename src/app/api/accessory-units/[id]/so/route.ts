// src/app/api/accessory-units/[id]/so/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { SO_ROLES, SO_LIMITED_USER_IDS, hasAnyRole } from "@/lib/permissions";

// ⚠️ Samakan dengan cara /api/accessories/[id]/so mengambil nama actor,
// supaya nama yang tampil di so_by konsisten di semua level (parent & unit).
function resolveActorName(user: AuthUser): string {
    return (user as any).name ?? (user as any).email ?? user.id ?? "Unknown";
}

// ─── GET /api/accessory-units/[id]/so — riwayat SO unit ini ──────────────────
export const GET = withAuth(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;

    const { data, error } = await supabaseAdmin
        .from("accessory_unit_so_history")
        .select("*")
        .eq("accessory_unit_id", id)
        .order("so_at", { ascending: false });

    if (error) {
        console.error("[GET /api/accessory-units/[id]/so]", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { history: data ?? [] } });
});

// ─── PATCH /api/accessory-units/[id]/so — tandai SO hari ini ─────────────────
export const PATCH = withAuth(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }, user: AuthUser) => {
    const roles = user.roles ?? [user.role];
    const canManageSo = hasAnyRole(roles, SO_ROLES) || SO_LIMITED_USER_IDS.includes(user.id ?? "");
    if (!canManageSo) {
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const { id } = await ctx.params;
    if (!id) {
        return NextResponse.json({ success: false, message: "ID unit tidak valid" }, { status: 400 });
    }
    let body: { notes?: string } = {};
    try { body = await req.json(); } catch { /* body kosong tetap valid */ }

    const soAt = new Date().toISOString();
    const soBy = resolveActorName(user);

    const { data: updated, error: updateErr } = await supabaseAdmin
        .from("accessory_units")
        .update({ so_at: soAt, so_by: soBy })
        .eq("id", id)
        .select("so_at, so_by")
        .single();

    if (updateErr) {
        console.error("[PATCH /api/accessory-units/[id]/so] update", updateErr);
        return NextResponse.json({ success: false, message: updateErr.message }, { status: 500 });
    }

    const { error: histErr } = await supabaseAdmin.from("accessory_unit_so_history").insert({
        accessory_unit_id: id,
        action: "SO",
        so_by: soBy,
        so_at: soAt,
        notes: body.notes || null,
    });
    if (histErr) {
        console.error("[PATCH /api/accessory-units/[id]/so] history insert", histErr);
    }

    // ✅ FIX: ROLLUP ke parent accessories.so_at — mirror pola laptop di
    // /api/units/[id]/so. Begitu SEMUA unit aktif sudah di-SO, baris model
    // di Data Barang otomatis ditandai "Sudah SO".
    // Filter "aktif" DISAMAKAN dengan OUT_STATUSES di frontend
    // (UnifiedBarangContent.tsx) + bukan anggota Kelompok MSJ — biar tidak
    // ada mismatch antara backend rollup dgn hitungan unit_count di UI.
    const OUT_STATUSES_ROLLUP = new Set([
        "SOLD", "TERJUAL", "KELUAR", "RETURNED", "RESERVED", "HELD", "PACKING", "PENDING",
    ]);
    try {
        // Ambil accessory_id dari unit yang baru di-update.
        const { data: thisUnit } = await supabaseAdmin
            .from("accessory_units")
            .select("accessory_id")
            .eq("id", id)
            .single();

        if (thisUnit?.accessory_id) {
            const { data: siblings } = await supabaseAdmin
                .from("accessory_units")
                .select("status, so_at, msj_group_id")
                .eq("accessory_id", thisUnit.accessory_id);

            const aktif = (siblings ?? []).filter(
                (u) => !OUT_STATUSES_ROLLUP.has(u.status) && !u.msj_group_id
            );
            // Semua unit aktif sudah SO → naikkan status ke parent model.
            // Kalau belum semua → jangan sentuh parent (angka progress X/Y di
            // Data Barang sudah reflect kondisi parsial).
            const allSo = aktif.length > 0 && aktif.every((u) => u.so_at != null);

            if (allSo) {
                await supabaseAdmin
                    .from("accessories")
                    .update({ so_at: soAt, so_by: soBy })
                    .eq("id", thisUnit.accessory_id);
            }
        }
    } catch (e) {
        // Rollup gagal TIDAK membatalkan SO unit yang sudah sukses.
        console.error("[PATCH /api/accessory-units/[id]/so] rollup", e);
    }

    return NextResponse.json({ success: true, data: updated });
});