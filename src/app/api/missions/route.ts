import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { canAssignToTarget, isMissionFullAccess } from "@/lib/missions";

const SELECT = `
  id, title, description, status, priority, due_date,
  proof_photo_url, proof_note, submitted_at, reviewed_at,
  rejection_reason, created_at, updated_at,
  assigned_by, assigned_to,
  assigner:users!missions_assigned_by_fkey(id, name, role, roles),
  assignee:users!missions_assigned_to_fkey(id, name, role, roles),
  reviewer:users!missions_reviewed_by_fkey(id, name),
  items:mission_items(id, mission_id, text, is_done, done_at, sort_order)
`;

// ── GET — list misi sesuai "box": received | assigned | all ─────────────────
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    const roles = user.roles ?? [user.role];
    const box = new URL(req.url).searchParams.get("box") ?? "received";

    let query = supabaseAdmin.from("missions").select(SELECT);

    if (box === "assigned") {
        query = query.eq("assigned_by", user.id);
    } else if (box === "all") {
        // full access → semua; selain itu → hanya yang terkait dirinya
        if (!isMissionFullAccess(roles)) {
            query = query.or(`assigned_to.eq.${user.id},assigned_by.eq.${user.id}`);
        }
    } else {
        query = query.eq("assigned_to", user.id); // default: misi yang saya terima
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
        console.error("[missions GET]", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data ?? [] });
}

// ── POST — buat misi baru ────────────────────────────────────────────────────
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    const roles = user.roles ?? [user.role];

    let body: any;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 }); }

    const { assigned_to, title, description, priority = "MEDIUM", due_date, items } = body;

    if (!assigned_to || !title?.trim()) {
        return NextResponse.json(
            { success: false, message: "Penerima & judul misi wajib diisi" },
            { status: 400 }
        );
    }
    if (!["LOW", "MEDIUM", "HIGH"].includes(priority)) {
        return NextResponse.json({ success: false, message: "Prioritas tidak valid" }, { status: 400 });
    }

    // Ambil roles target utk validasi izin
    const { data: target, error: targetErr } = await supabaseAdmin
        .from("users")
        .select("id, name, role, roles, is_active")
        .eq("id", assigned_to)
        .maybeSingle();

    if (targetErr || !target) {
        return NextResponse.json({ success: false, message: "User penerima tidak ditemukan" }, { status: 404 });
    }
    if (target.is_active === false) {
        return NextResponse.json({ success: false, message: "User penerima non-aktif" }, { status: 400 });
    }

    const targetRoles: string[] =
        Array.isArray(target.roles) && target.roles.length > 0 ? target.roles : [target.role];

    if (!canAssignToTarget(roles, targetRoles)) {
        return NextResponse.json(
            { success: false, message: "Kamu tidak berwenang memberi misi ke user ini" },
            { status: 403 }
        );
    }

    const { data, error } = await supabaseAdmin
        .from("missions")
        .insert({
            title: title.trim(),
            description: description?.trim() || null,
            assigned_by: user.id,
            assigned_to,
            priority,
            due_date: due_date || null,
            status: "PENDING",
        })
        .select("id")
        .single();

    if (error) {
        console.error("[missions POST]", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    if (Array.isArray(items) && items.length > 0) {
        const rows = items
            .map((t: any, i: number) => ({
                mission_id: data.id,
                text: String(t ?? "").trim(),
                sort_order: i,
            }))
            .filter((r: { text: string }) => r.text.length > 0);

        if (rows.length > 0) {
            const { error: itemsErr } = await supabaseAdmin.from("mission_items").insert(rows);
            if (itemsErr) {
                await supabaseAdmin.from("missions").delete().eq("id", data.id); // rollback
                console.error("[missions POST items]", itemsErr);
                return NextResponse.json({ success: false, message: itemsErr.message }, { status: 500 });
            }
        }
    }

    return NextResponse.json({ success: true, id: data.id });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);