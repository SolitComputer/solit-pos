// src/app/api/cashflow/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { CASHFLOW_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";
import { isValidCategory } from "@/lib/cashflow"; // ✅ tambah import

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

async function getAuthUser(req: NextRequest) {
    const token = req.cookies.get("token")?.value;
    if (!token) return null;
    return verifyToken(token);
}

function isCashflowUser(user: any): boolean {
    const roles: string[] =
        Array.isArray(user?.roles) && user.roles.length
            ? user.roles
            : [user?.role].filter(Boolean);
    return roles.some((r) => (CASHFLOW_ROLES as string[]).includes(r));
}

const SELECT_WITH_USERS = `
    *,
    created_by_user:users!cashflow_entries_created_by_fkey(id, name),
    audited_by_user:users!cashflow_entries_audited_by_fkey(id, name)
`;

// ── PATCH /api/cashflow/[id] — audit entry (one-way, tidak bisa dibatalkan) ──
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    if (!isCashflowUser(user))
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });

    const { id } = await ctx.params;
    if (!id)
        return NextResponse.json({ success: false, message: "ID tidak valid" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const action = body?.action ?? "toggle_audit";

    if (action !== "toggle_audit")
        return NextResponse.json(
            { success: false, message: `Aksi '${action}' tidak dikenal` },
            { status: 400 }
        );

    const supabase = getAdmin();

    const { data: current, error: fetchErr } = await supabase
        .from("cashflow_entries")
        .select("id, is_audited, source_type, source_id")
        .eq("id", id)
        .single();

    if (fetchErr || !current)
        return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

    // ✅ One-way only — tidak bisa un-audit
    if (current.is_audited)
        return NextResponse.json(
            { success: false, message: "Entry sudah diaudit dan tidak dapat dibatalkan" },
            { status: 400 }
        );

    // ✅ Guard: transaksi asli sudah di-restore/dibatalkan → tidak bisa diaudit
    if (current.source_type === "TRANSACTION" && current.source_id) {
        const { data: linkedTx } = await supabase
            .from("transactions")
            .select("status")
            .eq("invoice_number", current.source_id)
            .single();

        if (linkedTx && linkedTx.status !== "PAID")
            return NextResponse.json(
                { success: false, message: "Transaksi ini sudah dibatalkan (restore) dan tidak bisa diaudit" },
                { status: 400 }
            );
    }

    const { data, error } = await supabase
        .from("cashflow_entries")
        .update({
            is_audited: true,
            audited_by: user.id,
            audited_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(SELECT_WITH_USERS)
        .single();

    if (error) {
        console.error("[cashflow PATCH]", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
}

// ── PUT /api/cashflow/[id] — edit MANUAL OUT yang belum diaudit ──────────────
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    if (!isCashflowUser(user))
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });

    const { id } = await ctx.params;
    if (!id)
        return NextResponse.json({ success: false, message: "ID tidak valid" }, { status: 400 });

    const supabase = getAdmin();

    // Fetch dulu untuk validasi sebelum parse body
    const { data: current } = await supabase
        .from("cashflow_entries")
        .select("id, source_type, is_audited, direction")
        .eq("id", id)
        .single();

    if (!current)
        return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

    // Guard: hanya MANUAL yang bisa diedit
    if (current.source_type !== "MANUAL")
        return NextResponse.json(
            { success: false, message: "Hanya entry manual yang bisa diedit" },
            { status: 400 }
        );

    // Guard: yang sudah diaudit tidak bisa diedit
    if (current.is_audited)
        return NextResponse.json(
            { success: false, message: "Entry yang sudah diaudit tidak dapat diedit" },
            { status: 400 }
        );

    const body = await req.json().catch(() => ({}));
    const { category, nominal, keterangan, tanggal, payment_method } = body as {
        category?: string;
        nominal?: number | string;
        keterangan?: string | null;
        tanggal?: string;
        payment_method?: string;
    };

    // Validasi nominal
    const nom = Math.round(Number(nominal));
    if (!Number.isFinite(nom) || nom <= 0)
        return NextResponse.json({ success: false, message: "Nominal tidak valid" }, { status: 400 });

    // Validasi payment_method
    if (!payment_method || !["CASH", "SALDO"].includes(payment_method))
        return NextResponse.json(
            { success: false, message: "Metode pembayaran harus CASH atau SALDO" },
            { status: 400 }
        );

    // Validasi category
    if (category && !isValidCategory("OUT", category))
        return NextResponse.json({ success: false, message: "Kategori tidak valid" }, { status: 400 });

    // Validasi format tanggal
    if (tanggal && !/^\d{4}-\d{2}-\d{2}$/.test(tanggal))
        return NextResponse.json({ success: false, message: "Format tanggal tidak valid" }, { status: 400 });

    const { data, error } = await supabase
        .from("cashflow_entries")
        .update({
            category,
            nominal: nom,
            keterangan: keterangan?.trim() || null,
            tanggal,
            payment_method,
        })
        .eq("id", id)
        .select(SELECT_WITH_USERS)
        .single();

    if (error) {
        console.error("[cashflow PUT]", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
}

// ── DELETE /api/cashflow/[id] — hanya entry MANUAL yang boleh dihapus ────────
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    if (!isCashflowUser(user))
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });

    const { id } = await ctx.params;
    if (!id)
        return NextResponse.json({ success: false, message: "ID tidak valid" }, { status: 400 });

    const supabase = getAdmin();

    const { data: current } = await supabase
        .from("cashflow_entries")
        .select("id, source_type, is_audited")
        .eq("id", id)
        .single();

    if (!current)
        return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

    if (current.source_type !== "MANUAL")
        return NextResponse.json(
            { success: false, message: "Entry otomatis (transaksi/service) tidak bisa dihapus" },
            { status: 400 }
        );

    // ✅ Tambah guard: yang sudah diaudit tidak bisa dihapus
    if (current.is_audited)
        return NextResponse.json(
            { success: false, message: "Entry yang sudah diaudit tidak dapat dihapus" },
            { status: 400 }
        );

    const { error } = await supabase.from("cashflow_entries").delete().eq("id", id);
    if (error)
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
}