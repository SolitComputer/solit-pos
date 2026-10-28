// src/app/api/pengajuan-dana/execute-access/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import {
    hasAnyRole,
    expandRolesWithParents,
    PERMISSIONS as PERMS,
    FUND_EXECUTE_CANDIDATE_ROLES,
    FUND_EXECUTE_ACCESS_MANAGE_ROLES,
    FUND_REQUEST_VIEW_ROLES,
} from "@/lib/permissions";

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
// Kandidat yang muncul di panel: akun ber-role ADMIN / PURCHASING.
function isCandidate(u: CandidateRow): boolean {
    return rolesOfRow(u).some((r) => (FUND_EXECUTE_CANDIDATE_ROLES as string[]).includes(r));
}

// ── GET — daftar akun Admin/Purchasing + status centang izin eksekusi ─────────
async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
    const roles = effectiveRoles(user);
    const canManage = hasAnyRole(roles, PERMS.MANAGE_FUND_EXECUTE_ACCESS);

    const { data: access, error: aErr } = await supabaseAdmin
        .from("fund_execute_access")
        .select("user_id, is_active");
    if (aErr) {
        return NextResponse.json({ success: false, message: aErr.message }, { status: 500 });
    }

    const activeMap = new Map<string, boolean>(
        (access ?? []).map((a: any) => [a.user_id as string, !!a.is_active])
    );
    const myAccess = activeMap.get(user.id) === true;

    if (!canManage) {
        return NextResponse.json({ success: true, data: [], can_manage: false, my_access: myAccess });
    }

    const { data: users, error: uErr } = await supabaseAdmin
        .from("users")
        .select("id, name, role, roles")
        .order("name");
    if (uErr) {
        return NextResponse.json({ success: false, message: uErr.message }, { status: 500 });
    }

    const data = ((users ?? []) as CandidateRow[])
        .filter(isCandidate)
        .map((u) => ({
            user_id: u.id,
            name: u.name,
            role: rolesOfRow(u)[0],
            roles: rolesOfRow(u),
            // Default FALSE: izin eksekusi TIDAK otomatis dari role, harus dicentang.
            is_active: activeMap.get(u.id) === true,
        }));

    return NextResponse.json({ success: true, data, can_manage: true, my_access: myAccess });
}

// ── PUT — Admin/Purchasing atur centang izin eksekusi ────────────────────────
async function putHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    const roles = effectiveRoles(user);
    if (!hasAnyRole(roles, PERMS.MANAGE_FUND_EXECUTE_ACCESS)) {
        return NextResponse.json(
            { success: false, message: "Hanya Admin/Purchasing yang bisa mengubah akses eksekusi" },
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
            { success: false, message: "Hanya akun Admin/Purchasing yang bisa diberi izin eksekusi" },
            { status: 400 }
        );
    }

    const nowISO = new Date().toISOString();
    const { error } = await supabaseAdmin.from("fund_execute_access").upsert(
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

     return NextResponse.json({ success: true, updated: items.length });
}

export const GET = withAuth(getHandler, FUND_REQUEST_VIEW_ROLES);
export const PUT = withAuth(putHandler, FUND_EXECUTE_ACCESS_MANAGE_ROLES);