import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { hasAnyRole, SALES_REPORT_AUDIT_ROLES } from "@/lib/permissions";
import { currentPeriodWib } from "@/lib/marketing-insight";

export const dynamic = "force-dynamic";

const TABLE = "marketing_insight_sheets";

// READ: semua user login (gerbang withAuth).
// WRITE: Full access + tim Marketing (= yang boleh audit Laporan Harian Sales).
function getUserRoles(user: AuthUser): string[] {
    const anyUser = user as any;
    return Array.isArray(anyUser?.roles) && anyUser.roles.length > 0
        ? anyUser.roles
        : anyUser?.role
            ? [anyUser.role]
            : [];
}
function canManage(user: AuthUser): boolean {
    return hasAnyRole(getUserRoles(user), SALES_REPORT_AUDIT_ROLES);
}

// GET /api/marketing-insight — daftar semua tabel insight
async function getHandler() {
    try {
        const { data, error } = await supabaseAdmin
            .from(TABLE)
            .select("*")
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true });
        if (error) throw new Error(error.message);
        return NextResponse.json({ success: true, data: data ?? [] });
    } catch (error: any) {
        console.error("Insight list error:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}

// POST /api/marketing-insight — buat tabel baru { name }
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    try {
        if (!canManage(user)) {
            return NextResponse.json({ success: false, message: "Role Anda tidak diizinkan membuat tabel insight" }, { status: 403 });
        }
        const body = await req.json().catch(() => ({}));
        const name = (body?.name ?? "").toString().trim() || "Tabel Baru";

        const { data: last } = await supabaseAdmin
            .from(TABLE)
            .select("sort_order")
            .order("sort_order", { ascending: false })
            .limit(1)
            .maybeSingle();
        const sort_order = (last?.sort_order ?? -1) + 1;

        const stamp = Date.now().toString(36);
        const columns = [{ id: `c_${stamp}`, name: "Kolom 1" }];
        // Baris mode harian (per tanggal) digenerate di client sesuai `period`,
        // jadi tabel baru mulai TANPA baris tersimpan (rows kosong = hemat).
        const period = currentPeriodWib(); // "YYYY-MM" (bulan berjalan WIB)

        const { data, error } = await supabaseAdmin
            .from(TABLE)
            .insert({ name, columns, rows: [], period, row_mode: "manual", sort_order, created_by: user.id, created_by_name: user.name })
            .select()
            .single();
        if (error) throw new Error(error.message);
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error("Insight create error:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}

// PATCH /api/marketing-insight?id=xxx — simpan { name?, columns?, rows? }
async function patchHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    try {
        if (!canManage(user)) {
            return NextResponse.json({ success: false, message: "Role Anda tidak diizinkan mengubah tabel insight" }, { status: 403 });
        }
        const id = new URL(req.url).searchParams.get("id");
        if (!id) return NextResponse.json({ success: false, message: "id wajib diisi" }, { status: 400 });

        const body = await req.json().catch(() => ({}));
        const patch: Record<string, any> = { updated_at: new Date().toISOString() };
        if (typeof body.name === "string") patch.name = body.name.trim() || "Tabel Baru";
        if (Array.isArray(body.columns)) patch.columns = body.columns;
        if (Array.isArray(body.rows)) patch.rows = body.rows;
        if (typeof body.period === "string" && /^\d{4}-\d{2}$/.test(body.period)) patch.period = body.period;
        if (body.row_mode === "daily" || body.row_mode === "manual") patch.row_mode = body.row_mode;

        const { data, error } = await supabaseAdmin
            .from(TABLE)
            .update(patch)
            .eq("id", id)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error("Insight update error:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}

// DELETE /api/marketing-insight?id=xxx
async function deleteHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    try {
        if (!canManage(user)) {
            return NextResponse.json({ success: false, message: "Role Anda tidak diizinkan menghapus tabel insight" }, { status: 403 });
        }
        const id = new URL(req.url).searchParams.get("id");
        if (!id) return NextResponse.json({ success: false, message: "id wajib diisi" }, { status: 400 });

        const { error } = await supabaseAdmin.from(TABLE).delete().eq("id", id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Insight delete error:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);