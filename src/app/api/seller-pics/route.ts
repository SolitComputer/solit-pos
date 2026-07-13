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
        supabaseAdmin.from("seller_followup_pics").select("user_id, is_active"),
    ]);

    if (uErr || pErr) {
        return NextResponse.json(
            { success: false, message: uErr?.message ?? pErr?.message },
            { status: 500 }
        );
    }

    const activeMap = new Map<string, boolean>(
        (pics ?? []).map((p: any) => [p.user_id as string, !!p.is_active])
    );

    const data = ((users ?? []) as CandidateRow[])
        .filter(isCandidate)
        .map((u) => ({
            user_id: u.id,
            name: u.name,
            role: rolesOfRow(u)[0],
            roles: rolesOfRow(u),
            is_active: activeMap.get(u.id) ?? false,
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

    const items: { user_id: string; is_active: boolean }[] = Array.isArray(body.items)
        ? body.items
        : body.user_id
            ? [{ user_id: body.user_id, is_active: !!body.is_active }]
            : [];

    if (items.length === 0) {
        return NextResponse.json({ success: false, message: "Tidak ada perubahan" }, { status: 400 });
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
            is_active: i.is_active,
            updated_at: nowISO,
            updated_by: user.id,
        })),
        { onConflict: "user_id" }
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
                .map((i) => `${valid.get(i.user_id)?.name}: ${i.is_active ? "AKTIF" : "NONAKTIF"}`)
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