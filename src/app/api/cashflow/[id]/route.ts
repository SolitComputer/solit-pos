// src/app/api/cashflow/[id]/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { CASHFLOW_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { isValidCategory } from "@/lib/cashflow";

function getAdmin(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

/**
 * `is_voided` BUKAN kolom di tabel `cashflow_entries`.
 * Itu field turunan (derived) yang dihitung di GET /api/cashflow dengan
 * mencocokkan source_id ke tabel `transactions` lalu cek status !== "PAID".
 * Helper ini menghitung ulang status tersebut untuk satu entry.
 */
async function isEntryVoided(
    supabase: SupabaseClient,
    entry: { source_type: string | null; source_id: string | null }
): Promise<boolean> {
    if (entry.source_type !== "TRANSACTION" || !entry.source_id) return false;

    const { data: tx, error } = await supabase
        .from("transactions")
        .select("status")
        .eq("invoice_number", entry.source_id)
        .maybeSingle();

    if (error) {
        console.error("[cashflow] cek void gagal:", error.message);
        return false; // fail-open: jangan blokir aksi hanya karena lookup gagal
    }

    return !!tx && tx.status !== "PAID";
}

// ── PATCH /api/cashflow/[id] — toggle audit ───────────────────────────────────
export const PATCH = withAuth(async (req, ctx, user: any) => {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ success: false, message: "ID tidak valid" }, { status: 400 });

    const body = await req.json();
    const { action } = body as { action: string };

    if (action !== "toggle_audit")
        return NextResponse.json({ success: false, message: "Action tidak valid" }, { status: 400 });

    const supabase = getAdmin();

    // ✅ FIX: hapus `is_voided` dari select — kolomnya tidak ada di DB.
    //    Ambil `source_id` supaya status void bisa dihitung derived.
    const { data: entry, error: fetchErr } = await supabase
        .from("cashflow_entries")
        .select("id, is_audited, direction, source_type, source_id, nominal")
        .eq("id", id)
        .single();

    if (fetchErr || !entry) {
        console.error("[cashflow PATCH] fetch entry gagal:", fetchErr?.message, "| id:", id);
        return NextResponse.json(
            { success: false, message: fetchErr?.message || "Entry tidak ditemukan" },
            { status: 404 }
        );
    }

    if (await isEntryVoided(supabase, entry))
        return NextResponse.json(
            { success: false, message: "Entry yang dibatalkan tidak bisa diaudit" },
            { status: 400 }
        );

    if (Number(entry.nominal ?? 0) <= 0)
        return NextResponse.json(
            { success: false, message: "Entry dengan nominal 0 tidak bisa diaudit. Edit nominal terlebih dahulu." },
            { status: 400 }
        );

    if (entry.is_audited)
        return NextResponse.json(
            { success: false, message: "Entry sudah diaudit, tidak bisa dibatalkan" },
            { status: 400 }
        );

    const { data: updated, error: updateErr } = await supabase
        .from("cashflow_entries")
        .update({
            is_audited: true,
            audited_at: new Date().toISOString(),
            audited_by: user.id,
        })
        .eq("id", id)
        .select(`*, audited_by_user:users!cashflow_entries_audited_by_fkey(id, name)`)
        .single();

    if (updateErr) {
        console.error("[cashflow PATCH audit]", updateErr);
        return NextResponse.json({ success: false, message: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: updated });
}, CASHFLOW_ROLES);

// ── PUT /api/cashflow/[id] — edit uang keluar manual ─────────────────────────
export const PUT = withAuth(async (req, ctx, _user: any) => {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ success: false, message: "ID tidak valid" }, { status: 400 });

    const body = await req.json();
    const { category, nominal, keterangan, tanggal, payment_method } = body as {
        category: string;
        nominal: number | string;
        keterangan?: string;
        tanggal?: string;
        payment_method?: string;
    };

    const nom = Math.round(Number(nominal));

    // ✅ FIX: nominal 0 DIIZINKAN saat edit (koreksi entry salah input).
    //    Yang ditolak hanya non-numerik atau negatif.
    if (!Number.isFinite(nom) || nom < 0)
        return NextResponse.json(
            { success: false, message: "Nominal tidak valid (tidak boleh negatif)" },
            { status: 400 }
        );

    const supabase = getAdmin();

    const { data: entry, error: fetchErr } = await supabase
        .from("cashflow_entries")
        .select("id, direction, source_type, is_audited")
        .eq("id", id)
        .single();

    if (fetchErr || !entry)
        return NextResponse.json({ success: false, message: "Entry tidak ditemukan" }, { status: 404 });

    if (entry.direction !== "OUT")
        return NextResponse.json({ success: false, message: "Hanya uang keluar yang bisa diedit" }, { status: 400 });

    if (entry.source_type !== "MANUAL")
        return NextResponse.json({ success: false, message: "Hanya entry manual yang bisa diedit" }, { status: 400 });

    if (entry.is_audited)
        return NextResponse.json({ success: false, message: "Entry yang sudah diaudit tidak bisa diedit" }, { status: 400 });

    if (!isValidCategory("OUT", category))
        return NextResponse.json({ success: false, message: "Kategori tidak valid" }, { status: 400 });

    if (!payment_method || !["CASH", "SALDO"].includes(payment_method))
        return NextResponse.json(
            { success: false, message: "Metode pembayaran harus CASH atau SALDO" },
            { status: 400 }
        );

    const jakartaToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

    const { data: updated, error: updateErr } = await supabase
        .from("cashflow_entries")
        .update({
            category,
            nominal: nom,
            keterangan: keterangan?.trim() || null,
            tanggal: tanggal || jakartaToday,
            payment_method,
        })
        .eq("id", id)
        .select(`*, created_by_user:users!cashflow_entries_created_by_fkey(id, name)`)
        .single();

    if (updateErr) {
        console.error("[cashflow PUT]", updateErr);
        return NextResponse.json({ success: false, message: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: updated });
}, CASHFLOW_ROLES);

// ── DELETE /api/cashflow/[id] — hapus entry manual ───────────────────────────
export const DELETE = withAuth(async (_req, ctx) => {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ success: false, message: "ID tidak valid" }, { status: 400 });

    const supabase = getAdmin();

    const { data: entry, error: fetchErr } = await supabase
        .from("cashflow_entries")
        .select("id, source_type, is_audited, direction")
        .eq("id", id)
        .single();

    if (fetchErr || !entry)
        return NextResponse.json({ success: false, message: "Entry tidak ditemukan" }, { status: 404 });

    if (entry.source_type !== "MANUAL")
        return NextResponse.json({ success: false, message: "Hanya entry manual yang bisa dihapus" }, { status: 400 });

    if (entry.is_audited)
        return NextResponse.json({ success: false, message: "Entry yang sudah diaudit tidak bisa dihapus" }, { status: 400 });

    const { error: deleteErr } = await supabase
        .from("cashflow_entries")
        .delete()
        .eq("id", id);

    if (deleteErr) {
        console.error("[cashflow DELETE]", deleteErr);
        return NextResponse.json({ success: false, message: deleteErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}, CASHFLOW_ROLES);