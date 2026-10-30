// src/app/api/seller-pics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import {
    hasAnyRole,
    expandRolesWithParents,
    PERMISSIONS as PERMS,
    SELLER_PIC_CANDIDATE_ROLES,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface CandidateRow {
    id: string;
    name: string;
    role: string;
    roles: string[] | null;
}

function effectiveRoles(user: AuthUser): string[] {
    return expandRolesWithParents(user.roles ?? [user.role]);
}

function rolesOfRow(u: CandidateRow): string[] {
    return Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [u.role].filter(Boolean);
}

function isCandidate(u: CandidateRow): boolean {
    return rolesOfRow(u).some((r) => (SELLER_PIC_CANDIDATE_ROLES as string[]).includes(r));
}

// ── GET — daftar kandidat PIC (Crew Sales + Kepala Marketing) + status aktif ──
async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
    const roles = effectiveRoles(user);

    const [{ data: users, error: uErr }, { data: pics, error: pErr }] = await Promise.all([
        supabaseAdmin.from("users").select("id, name, role, roles").order("name"),
        // ✅ sekarang ikut ambil seller_type — whitelist dipisah per kategori
        supabaseAdmin.from("seller_followup_pics").select("user_id, seller_type, is_active"),
    ]);

    if (uErr || pErr) {
        return NextResponse.json(
            { success: false, message: uErr?.message ?? pErr?.message },
            { status: 500 }
        );
    }

    // ✅ Map per (user_id + seller_type). Key digabung "userId::TYPE" supaya
    // satu orang bisa punya 2 status terpisah (USER & PEDAGANG).
    const activeMap = new Map<string, boolean>(
        (pics ?? []).map((p: any) => [`${p.user_id}::${p.seller_type}`, !!p.is_active])
    );

    const data = ((users ?? []) as CandidateRow[])
        .filter(isCandidate)
        .map((u) => ({
            user_id: u.id,
            name: u.name,
            role: rolesOfRow(u)[0],
            roles: rolesOfRow(u),
            // ✅ dua status terpisah; default false kalau belum ada barisnya
            is_active_user: activeMap.get(`${u.id}::USER`) ?? false,
            is_active_pedagang: activeMap.get(`${u.id}::PEDAGANG`) ?? false,
        }));

    return NextResponse.json({
        success: true,
        data,
        can_manage: hasAnyRole(roles, PERMS.MANAGE_SELLER_PIC),
    });
}

// ── PUT — Admin toggle akses FU (single atau bulk) ───────────────────────────
async function putHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    const roles = effectiveRoles(user);
    if (!hasAnyRole(roles, PERMS.MANAGE_SELLER_PIC)) {
        return NextResponse.json(
            { success: false, message: "Hanya Admin yang bisa mengubah akses PIC follow-up" },
            { status: 403 }
        );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
        return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 });
    }

    // ✅ Tiap item sekarang WAJIB bawa seller_type (USER / PEDAGANG) —
    // whitelist dipisah per kategori. Mode single & bulk sama-sama didukung.
    const rawItems: { user_id: string; seller_type: string; is_active: boolean }[] =
        Array.isArray(body.items)
            ? body.items
            : body.user_id
                ? [{ user_id: body.user_id, seller_type: body.seller_type, is_active: !!body.is_active }]
                : [];

    if (rawItems.length === 0) {
        return NextResponse.json({ success: false, message: "Tidak ada perubahan" }, { status: 400 });
    }

    // ✅ Validasi seller_type: hanya USER / PEDAGANG yang diterima. Mencegah
    // baris sampah masuk kalau frontend lupa/salah kirim kategori.
    const items = rawItems.map((i) => ({
        user_id: i.user_id,
        seller_type: i.seller_type,
        is_active: !!i.is_active,
    }));

    const badType = items.find((i) => i.seller_type !== "USER" && i.seller_type !== "PEDAGANG");
    if (badType) {
        return NextResponse.json(
            { success: false, message: "seller_type wajib USER atau PEDAGANG" },
            { status: 400 }
        );
    }

    // Validasi: target harus benar-benar Crew Sales / Kepala Marketing
    const ids = items.map((i) => i.user_id);
    const { data: targets, error: tErr } = await supabaseAdmin
        .from("users")
        .select("id, name, role, roles")
        .in("id", ids);

    if (tErr) {
        return NextResponse.json({ success: false, message: tErr.message }, { status: 500 });
    }

    const valid = new Map<string, CandidateRow>();
    for (const t of (targets ?? []) as CandidateRow[]) {
        if (isCandidate(t)) valid.set(t.id, t);
    }

    const invalid = ids.filter((id) => !valid.has(id));
    if (invalid.length > 0) {
        return NextResponse.json(
            { success: false, message: "Hanya Crew Sales & Kepala Marketing yang bisa dijadikan PIC" },
            { status: 400 }
        );
    }

    const nowISO = new Date().toISOString();
    const { error } = await supabaseAdmin.from("seller_followup_pics").upsert(
        items.map((i) => ({
            user_id: i.user_id,
            seller_type: i.seller_type, // ✅ wajib ikut — bagian dari PK baru
            is_active: i.is_active,
            updated_at: nowISO,
            updated_by: user.id,
        })),
        // ✅ onConflict sekarang gabungan (user_id, seller_type) sesuai PK baru.
        // Kalau tetap "user_id" saja, upsert akan error / salah sasaran.
        { onConflict: "user_id,seller_type" }
    );

    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    try {
        await logActivity({
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            action: "EDIT",
            entity: "seller_followup_pic",
            entityId: items.map((i) => i.user_id).join(","),
            entityLabel: items
                .map(
                    (i) =>
                        `${valid.get(i.user_id)?.name} [${i.seller_type}]: ${i.is_active ? "AKTIF" : "NONAKTIF"
                        }`
                )
                .join(", "),
            afterData: items,
        });
    } catch (e: any) {
        console.error("[activity log seller_pic]", e?.message ?? e);
    }

    return NextResponse.json({ success: true, updated: items.length });
}

export const GET = withAuth(getHandler, PERMISSIONS.VIEW_SELLER_FOLLOWUP);
export const PUT = withAuth(putHandler, PERMISSIONS.VIEW_SELLER_FOLLOWUP);