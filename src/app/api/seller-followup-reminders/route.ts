// src/app/api/seller-followup-reminders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import {
    hasAnyRole,
    expandRolesWithParents,
    PERMISSIONS as PERMS,
    SELLER_PIC_CANDIDATE_ROLES,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

const DEFAULT_MESSAGE = "Ayo segera follow-up customer kamu 🔔";
const DUPLICATE_WINDOW_MS = 60_000; // cegah double-klik dalam 1 menit

// ── POST — Admin mengirim reminder follow-up ke satu PIC ─────────────────────
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    const roles = expandRolesWithParents(user.roles ?? [user.role]);

    // Hanya Admin (pemegang akses kelola PIC) yang boleh kirim reminder
    if (!hasAnyRole(roles, PERMS.MANAGE_SELLER_PIC)) {
        return NextResponse.json(
            { success: false, message: "Hanya Admin yang bisa mengirim reminder follow-up" },
            { status: 403 }
        );
    }

    const body = await req.json().catch(() => null);
    const targetUserId: string | undefined = body?.target_user_id;
    if (!targetUserId) {
        return NextResponse.json(
            { success: false, message: "target_user_id wajib diisi" },
            { status: 400 }
        );
    }

    const { data: target, error: targetErr } = await supabaseAdmin
        .from("users")
        .select("id, name, role, roles")
        .eq("id", targetUserId)
        .maybeSingle();

    if (targetErr || !target) {
        return NextResponse.json(
            { success: false, message: "User tujuan tidak ditemukan" },
            { status: 404 }
        );
    }

    const targetRoles: string[] =
        Array.isArray(target.roles) && target.roles.length > 0
            ? target.roles
            : [target.role].filter(Boolean);

    const isValidCandidate = targetRoles.some((r) =>
        (SELLER_PIC_CANDIDATE_ROLES as string[]).includes(r)
    );

    const { data: picRow } = await supabaseAdmin
        .from("seller_followup_pics")
        .select("is_active")
        .eq("user_id", targetUserId)
        .maybeSingle();

    // Reminder hanya masuk akal untuk PIC yang sedang aktif
    if (!isValidCandidate || !picRow?.is_active) {
        return NextResponse.json(
            { success: false, message: "User ini belum diaktifkan sebagai PIC follow-up" },
            { status: 400 }
        );
    }

    // Cegah spam double-klik: kalau ada reminder belum dibaca dalam 1 menit terakhir, jangan duplikat
    const sinceISO = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
    const { data: recent } = await supabaseAdmin
        .from("seller_followup_reminders")
        .select("id, created_at")
        .eq("target_user_id", targetUserId)
        .eq("is_read", false)
        .gte("created_at", sinceISO)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (recent) {
        return NextResponse.json({
            success: true,
            data: recent,
            note: "Reminder sudah terkirim baru saja",
        });
    }

    const { data, error } = await supabaseAdmin
        .from("seller_followup_reminders")
        .insert({
            target_user_id: targetUserId,
            sent_by: user.id,
            sent_by_name: user.name,
            sent_by_role: user.role,  
            message: DEFAULT_MESSAGE,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    try {
        await logActivity({
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            action: "CREATE",
            entity: "seller_followup_reminder",
            entityId: data.id,
            entityLabel: `Reminder FU → ${target.name}`,
            afterData: data,
        });
    } catch (e: any) {
        console.error("[activity log seller_reminder]", e?.message ?? e);
    }

    return NextResponse.json({ success: true, data });
}

// ── GET — daftar reminder belum dibaca milik user yang login ─────────────────
async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
    const { data, error } = await supabaseAdmin
        .from("seller_followup_reminders")
        .select("*")
        .eq("target_user_id", user.id)
        .eq("is_read", false)
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
}

export const POST = withAuth(postHandler, PERMISSIONS.VIEW_SELLER_FOLLOWUP);
export const GET = withAuth(getHandler, PERMISSIONS.VIEW_SELLER_FOLLOWUP);