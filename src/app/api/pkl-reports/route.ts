import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

const FULL_ACCESS = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];
const KEPALA_ROLES = [
    "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
    "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH",
];

// Kepala → divisi PKL yang dia pantau
const KEPALA_DIVISION_MAP: Record<string, string> = {
    KEPALA_MARKETING: "MARKETING",
    KEPALA_SALES: "SALES",
    KEPALA_PENYEDIA_BARANG: "PENYEDIA_BARANG",
    KEPALA_TEKNISI: "TEKNISI",
    KEPALA_ONPOINT: "ONPOINT",
    KEPALA_SOTECH: "SOTECH",
};

function isFullAccess(role: string) { return FULL_ACCESS.includes(role); }
function isKepala(role: string)     { return KEPALA_ROLES.includes(role); }
function isPKL(role: string)        { return role === "PKL" || role.startsWith("PKL_") || role.startsWith("PKL-"); }

// ── GET — ambil laporan ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const division  = searchParams.get("division");  // filter divisi
    const pklUserId = searchParams.get("pkl_user_id");
    const dateFrom  = searchParams.get("date_from");
    const dateTo    = searchParams.get("date_to");
    const status    = searchParams.get("status");
    const page      = parseInt(searchParams.get("page") ?? "1");
    const limit     = parseInt(searchParams.get("limit") ?? "50");
    const offset    = (page - 1) * limit;

    let query = supabaseAdmin
        .from("pkl_work_reports")
        .select(`
            id, user_id, division, report_date, title, description,
            status, review_note, reviewed_at,
            created_at, updated_at,
            users!pkl_work_reports_user_id_fkey(id, name, role),
            reviewer:pkl_work_reports_reviewed_by_fkey(id, name, role)
        `, { count: "exact" });

    // ── Scope berdasarkan role ────────────────────────────────────────────────
    if (isPKL(user.role)) {
        // PKL hanya lihat laporan sendiri
        query = query.eq("user_id", user.id);
    } else if (isKepala(user.role)) {
        // Kepala lihat laporan PKL di divisinya
        const kepalaDiv = KEPALA_DIVISION_MAP[user.role];
        // Ambil semua PKL yang termasuk divisi ini
        const { data: pklUsers } = await supabaseAdmin
            .from("users")
            .select("id")
            .or(`role.eq.PKL,role.ilike.PKL_%,role.ilike.PKL-%`)
            .contains("metadata", { division: kepalaDiv }); // jika ada metadata
        
        // Fallback: filter berdasar divisi laporan
        if (kepalaDiv) {
            query = query.eq("division", kepalaDiv);
        }
    }
    // Full access: tidak ada scope tambahan

    // ── Filter optional ──────────────────────────────────────────────────────
    if (division && !isPKL(user.role)) query = query.eq("division", division);
    if (pklUserId)  query = query.eq("user_id", pklUserId);
    if (dateFrom)   query = query.gte("report_date", dateFrom);
    if (dateTo)     query = query.lte("report_date", dateTo);
    if (status)     query = query.eq("status", status);

    const { data, error, count } = await query
        .order("report_date", { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) {
        console.error("[pkl-reports GET]", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data, count, page, limit });
}

// ── POST — buat / tambah laporan ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    // ── Action: review (Kepala / Admin) ──────────────────────────────────────
    if (action === "review") {
        if (!isFullAccess(user.role) && !isKepala(user.role)) {
            return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
        }
        const { report_id, review_note, status: newStatus } = body;
        if (!report_id) return NextResponse.json({ success: false, message: "report_id wajib" }, { status: 400 });

        const { data, error } = await supabaseAdmin
            .from("pkl_work_reports")
            .update({
                review_note: review_note ?? null,
                reviewed_by: user.id,
                reviewed_at: new Date().toISOString(),
                status: newStatus ?? "REVIEWED",
                updated_at: new Date().toISOString(),
            })
            .eq("id", report_id)
            .select()
            .single();

        if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        return NextResponse.json({ success: true, data });
    }

    // ── Action: tambah laporan manual (Admin only, untuk PKL manapun) ─────────
    if (action === "admin_add") {
        if (!isFullAccess(user.role)) {
            return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
        }
        const { pkl_user_id, division, report_date, title, description } = body;
        if (!pkl_user_id || !division || !report_date || !description) {
            return NextResponse.json({ success: false, message: "pkl_user_id, division, report_date, description wajib" }, { status: 400 });
        }

        // Cek apakah sudah ada laporan di tanggal yang sama untuk user ini
        const { data: existing } = await supabaseAdmin
            .from("pkl_work_reports")
            .select("id")
            .eq("user_id", pkl_user_id)
            .eq("report_date", report_date)
            .maybeSingle();

        if (existing) {
            return NextResponse.json({ success: false, message: "Laporan untuk tanggal ini sudah ada" }, { status: 409 });
        }

        const { data, error } = await supabaseAdmin
            .from("pkl_work_reports")
            .insert({
                user_id: pkl_user_id,
                division,
                report_date,
                title: title ?? `Laporan ${report_date}`,
                description,
                status: "SUBMITTED",
                created_by_admin: user.id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        return NextResponse.json({ success: true, data });
    }

    // ── Default: PKL buat laporan sendiri ─────────────────────────────────────
    if (!isPKL(user.role)) {
        return NextResponse.json({ success: false, message: "Hanya PKL yang bisa membuat laporan kerja" }, { status: 403 });
    }

    const { division, report_date, title, description } = body;
    if (!division || !report_date || !description) {
        return NextResponse.json({ success: false, message: "division, report_date, description wajib" }, { status: 400 });
    }

    // Cek laporan duplikat (same user + same date)
    const { data: existing } = await supabaseAdmin
        .from("pkl_work_reports")
        .select("id")
        .eq("user_id", user.id)
        .eq("report_date", report_date)
        .maybeSingle();

    if (existing) {
        return NextResponse.json({ success: false, message: "Laporan untuk tanggal ini sudah ada" }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
        .from("pkl_work_reports")
        .insert({
            user_id: user.id,
            division,
            report_date,
            title: title || `Laporan ${report_date}`,
            description,
            status: "SUBMITTED",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (error) {
        console.error("[pkl-reports POST]", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
}

// ── PATCH — edit laporan ──────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { id, title, description, status } = body;
    if (!id) return NextResponse.json({ success: false, message: "id wajib" }, { status: 400 });

    // Ambil laporan untuk cek kepemilikan
    const { data: existing } = await supabaseAdmin
        .from("pkl_work_reports")
        .select("user_id, status")
        .eq("id", id)
        .maybeSingle();

    if (!existing) return NextResponse.json({ success: false, message: "Laporan tidak ditemukan" }, { status: 404 });

    // PKL hanya bisa edit laporan sendiri & belum REVIEWED
    if (isPKL(user.role)) {
        if (existing.user_id !== user.id) {
            return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
        }
        if (existing.status === "REVIEWED") {
            return NextResponse.json({ success: false, message: "Laporan yang sudah direview tidak bisa diedit" }, { status: 400 });
        }
    } else if (!isFullAccess(user.role) && !isKepala(user.role)) {
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (title)       updates.title       = title;
    if (description) updates.description = description;
    if (status && isFullAccess(user.role)) updates.status = status;

    const { data, error } = await supabaseAdmin
        .from("pkl_work_reports")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
}

// ── DELETE — hapus laporan ────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, message: "id wajib" }, { status: 400 });

    // Hanya admin atau pemilik yang bisa hapus
    if (!isFullAccess(user.role)) {
        const { data: existing } = await supabaseAdmin
            .from("pkl_work_reports")
            .select("user_id")
            .eq("id", id)
            .maybeSingle();
        
        if (!existing || existing.user_id !== user.id) {
            return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
        }
    }

    const { error } = await supabaseAdmin.from("pkl_work_reports").delete().eq("id", id);
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}