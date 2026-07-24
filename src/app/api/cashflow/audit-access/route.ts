// src/app/api/cashflow/audit-access/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import {
    hasAnyRole,
    expandRolesWithParents,
    PERMISSIONS as PERMS,
    CASHFLOW_ROLES,
    CASHFLOW_AUDIT_OUT_ROLES,
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

// Kandidat: siapapun yang punya akses ke halaman Cashflow (bisa lihat Uang Keluar).
function isCandidate(u: CandidateRow): boolean {
    return rolesOfRow(u).some((r) => (CASHFLOW_ROLES as string[]).includes(r));
}

// Role yang SUDAH otomatis boleh audit uang keluar (whitelist ini hanya berlaku
// untuk role di luar itu, misal PURCHASING).
function roleGrantsAccess(u: CandidateRow): boolean {
    return rolesOfRow(u).some((r) => (CASHFLOW_AUDIT_OUT_ROLES as string[]).includes(r));
}

// ── GET — daftar akun & status whitelist audit uang keluar ───────────────────
async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
    const roles = effectiveRoles(user);
    const canManage = hasAnyRole(roles, PERMS.MANAGE_CASHFLOW_AUDIT_ACCESS);

    const { data: access, error: aErr } = await supabaseAdmin
        .from("cashflow_audit_out_access")
        .select("user_id, is_active");

    if (aErr) {
        return NextResponse.json({ success: false, message: aErr.message }, { status: 500 });
    }

    // user_id yang PUNYA baris di sini artinya sudah pernah di-override secara
    // eksplisit oleh Admin/Programmer (baik diaktifkan MAUPUN dinonaktifkan).
    // Kalau belum pernah di-override, defaultnya ikut role (CASHFLOW_AUDIT_OUT_ROLES) —
    // tapi begitu ada override eksplisit, itu yang menang, termasuk untuk akun ADMIN.
    const overrideMap = new Map<string, boolean>(
        (access ?? []).map((a: any) => [a.user_id as string, !!a.is_active])
    );

    const myRoleDefault = hasAnyRole(roles, CASHFLOW_AUDIT_OUT_ROLES);
    const myAccess = overrideMap.has(user.id) ? overrideMap.get(user.id)! : myRoleDefault;

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
        .map((u) => {
            const roleDefault = roleGrantsAccess(u);
            return {
                user_id: u.id,
                name: u.name,
                role: rolesOfRow(u)[0],
                roles: rolesOfRow(u),
                role_grants_access: roleDefault,
                is_active: overrideMap.has(u.id) ? overrideMap.get(u.id)! : roleDefault,
            };
        });

    return NextResponse.json({ success: true, data, can_manage: true, my_access: myAccess });
}

// ── PUT — Admin/Programmer atur whitelist akun audit uang keluar ────────────
async function putHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    const roles = effectiveRoles(user);
    if (!hasAnyRole(roles, PERMS.MANAGE_CASHFLOW_AUDIT_ACCESS)) {
        return NextResponse.json(
            { success: false, message: "Hanya Admin/Programmer yang bisa mengubah akses audit uang keluar" },
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
            { success: false, message: "Hanya akun dengan akses Cashflow yang bisa diberi izin audit uang keluar" },
            { status: 400 }
        );
    }

    const nowISO = new Date().toISOString();
    const { error } = await supabaseAdmin.from("cashflow_audit_out_access").upsert(
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
            entity: "cashflow_audit_access",
            entityId: items.map((i) => i.user_id).join(","),
            entityLabel: items
                .map((i) => `${valid.get(i.user_id)?.name}: ${i.is_active ? "DIIZINKAN" : "DICABUT"}`)
                .join(", "),
            afterData: items,
        });
    } catch (e: any) {
        console.error("[activity log cashflow_audit_access]", e?.message ?? e);
    }

    return NextResponse.json({ success: true, updated: items.length });
}

export const GET = withAuth(getHandler, PERMISSIONS.VIEW_CASHFLOW);
export const PUT = withAuth(putHandler, PERMISSIONS.VIEW_CASHFLOW);
