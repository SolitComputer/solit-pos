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

    // Cek status SO sekarang untuk niat "SO Ulang" vs "SO" pertama kali —
    // pola sama persis dgn /api/laptops/[id]/so supaya notes konsisten.
    const { data: before } = await supabaseAdmin
        .from("accessories")
        .select("so_at")
        .eq("id", id)
        .single();
    const wasAlreadySo = before?.so_at != null;

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

    // ✅ FIX: PROPAGATE ke SEMUA accessory_units aktif — supaya tab/halaman
    // Kelola Unit Aksesoris juga sync. Dulu endpoint ini cuma update
    // accessories.so_at, jadi kalau user "SO" dari Data Barang → di Kelola
    // Unit Aksesoris semua unit masih "Belum SO".
    // Filter aktif = OUT_STATUSES (sama dengan rollup di
    // /api/accessory-units/[id]/so & dengan UnifiedBarangContent.tsx).
    const OUT_STATUSES_PROPAGATE = new Set([
        "SOLD", "TERJUAL", "KELUAR", "RETURNED", "RESERVED", "HELD", "PACKING", "PENDING",
    ]);
    try {
        const { data: unitsBefore } = await supabaseAdmin
            .from("accessory_units")
            .select("id, status, msj_group_id")
            .eq("accessory_id", id);

        const unitAktif = (unitsBefore ?? []).filter(
            (u) => !OUT_STATUSES_PROPAGATE.has(u.status) && !u.msj_group_id
        );

        if (unitAktif.length > 0) {
            const unitIds = unitAktif.map((u) => u.id);
            // Update semua unit aktif sekaligus — 1 query, atomic.
            await supabaseAdmin
                .from("accessory_units")
                .update({ so_at: soAt, so_by: soBy })
                .in("id", unitIds);

            // Log tiap unit ke accessory_unit_so_history supaya riwayat SO
            // per-unit di halaman Kelola Unit Aksesoris juga nyata, bukan
            // "tiba-tiba sudah SO" tanpa jejak.
            const unitLogs = unitAktif.map((u) => ({
                accessory_unit_id: u.id,
                action: "SO" as const,
                so_by: soBy,
                so_at: soAt,
                notes: wasAlreadySo
                    ? (body.notes ? `${body.notes} (SO Ulang — dari SO Model)` : "SO Ulang (dari SO Model)")
                    : (body.notes ? `${body.notes} (dari SO Model)` : "Dari SO Model"),
            }));
            await supabaseAdmin.from("accessory_unit_so_history").insert(unitLogs);
        }
    } catch (e) {
        // Propagate gagal TIDAK membatalkan SO model yang sudah sukses.
        console.error("[PATCH /api/accessories/[id]/so] propagate", e);
    }

    const { error: histErr } = await supabaseAdmin.from("accessory_so_history").insert({
        accessory_id: id,
        action: "SO",
        so_by: soBy,
        so_at: soAt,
        notes: body.notes || null,
    });
    if (histErr) {
        console.error("[PATCH /api/accessories/[id]/so] history insert", histErr);
    }

    return NextResponse.json({ success: true, data: updated });
});