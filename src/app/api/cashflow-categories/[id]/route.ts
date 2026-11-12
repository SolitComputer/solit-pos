// src/app/api/cashflow-categories/[id]/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { CASHFLOW_CATEGORY_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
// ⬅️ DIHAPUS: ACCOUNT_MAP (hardcoded) tidak lagi dipakai untuk validasi akun.
// Validasi sekarang langsung query ke DB table `accounts` — sama dengan POST
// handler di route.ts parent. Konsisten dengan dropdown CategoryManagerModal.

function getAdmin(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

// ── PUT /api/cashflow-categories/[id] — edit kategori custom ──────────────
// Yang bisa diedit: label, account_code, direction. KEY tidak bisa diedit
// supaya entry cashflow lama yang pakai key ini tetap kebaca.
export const PUT = withAuth(async (req, ctx, _user) => {
    const { id } = await ctx.params;
    if (!id)
        return NextResponse.json(
            { success: false, message: "ID tidak valid" },
            { status: 400 }
        );

    const body = await req.json();
    const { label, account_code, direction } = body as {
        label?: string;
        account_code?: string;
        direction?: string;
    };

    const supabase = getAdmin();

    // Pastikan kategori ada
    const { data: existing, error: fetchErr } = await supabase
        .from("cashflow_custom_categories")
        .select("id, key, label, account_code, direction, is_active")
        .eq("id", id)
        .single();

    if (fetchErr || !existing)
        return NextResponse.json(
            { success: false, message: "Kategori tidak ditemukan" },
            { status: 404 }
        );

    // ── Validasi field yang diubah ──
    const updatePayload: Record<string, any> = {};

    if (label !== undefined) {
        const trimmed = label.trim();
        if (!trimmed)
            return NextResponse.json(
                { success: false, message: "Nama kategori wajib diisi" },
                { status: 400 }
            );
        if (trimmed.length > 100)
            return NextResponse.json(
                { success: false, message: "Nama kategori maksimal 100 karakter" },
                { status: 400 }
            );
        updatePayload.label = trimmed;
    }

    if (account_code !== undefined) {
        // ⬅️ UPDATE: validasi akun langsung ke DB (table `accounts`), bukan ACCOUNT_MAP
        // hardcoded. Alasan sama dengan POST handler di route.ts — supaya akun custom
        // & akun bawaan apa pun yang tercatat di DB bisa dipakai untuk edit kategori.
        const { data: accountFromDB, error: accCheckErr } = await supabase
            .from("chart_of_accounts")
            .select("code, name, is_active")
            .eq("code", account_code)
            .maybeSingle();

        if (accCheckErr) {
            console.error("[cashflow-categories PUT account check]", accCheckErr);
            return NextResponse.json(
                { success: false, message: `Gagal verifikasi akun: ${accCheckErr.message}` },
                { status: 500 }
            );
        }
        if (!accountFromDB) {
            return NextResponse.json(
                { success: false, message: `Akun dengan kode ${account_code} tidak ditemukan di sistem` },
                { status: 400 }
            );
        }
        if (accountFromDB.is_active === false) {
            return NextResponse.json(
                { success: false, message: `Akun ${accountFromDB.code} — ${accountFromDB.name} sudah diarsipkan — tidak bisa dipakai` },
                { status: 400 }
            );
        }
        updatePayload.account_code = account_code;
    }

    if (direction !== undefined) {
        if (!["IN", "OUT", "BOTH"].includes(direction))
            return NextResponse.json(
                { success: false, message: "Arah kategori harus IN, OUT, atau BOTH" },
                { status: 400 }
            );
        updatePayload.direction = direction;
    }

    if (Object.keys(updatePayload).length === 0)
        return NextResponse.json(
            { success: false, message: "Tidak ada field yang diubah" },
            { status: 400 }
        );

    const { data: updated, error: updateErr } = await supabase
        .from("cashflow_custom_categories")
        .update(updatePayload)
        .eq("id", id)
        .select(`
            *,
            created_by_user:users!cashflow_custom_categories_created_by_fkey(id, name)
        `)
        .single();

    if (updateErr) {
        console.error("[cashflow-categories PUT]", updateErr);
        return NextResponse.json(
            { success: false, message: updateErr.message },
            { status: 500 }
        );
    }

    return NextResponse.json({ success: true, data: updated });
}, CASHFLOW_CATEGORY_MANAGE_ROLES);

// ── DELETE /api/cashflow-categories/[id] — arsip kategori custom ──────────
// SOFT DELETE: set is_active=false. Entry cashflow lama yang pakai kategori
// ini tetap kebaca (pakai label lama), cuma gak muncul lagi di dropdown.
export const DELETE = withAuth(async (_req, ctx, _user) => {
    const { id } = await ctx.params;
    if (!id)
        return NextResponse.json(
            { success: false, message: "ID tidak valid" },
            { status: 400 }
        );

    const supabase = getAdmin();

    const { data: existing, error: fetchErr } = await supabase
        .from("cashflow_custom_categories")
        .select("id, is_active")
        .eq("id", id)
        .single();

    if (fetchErr || !existing)
        return NextResponse.json(
            { success: false, message: "Kategori tidak ditemukan" },
            { status: 404 }
        );

    if (!existing.is_active)
        return NextResponse.json(
            { success: false, message: "Kategori sudah diarsipkan" },
            { status: 400 }
        );

    const { error: updateErr } = await supabase
        .from("cashflow_custom_categories")
        .update({ is_active: false })
        .eq("id", id);

    if (updateErr) {
        console.error("[cashflow-categories DELETE]", updateErr);
        return NextResponse.json(
            { success: false, message: updateErr.message },
            { status: 500 }
        );
    }

    return NextResponse.json({ success: true });
}, CASHFLOW_CATEGORY_MANAGE_ROLES);

// ── PATCH /api/cashflow-categories/[id] — reaktivasi kategori yang diarsip ──
// Terpisah dari PUT supaya intent jelas (reactivate = aksi khusus, bukan edit).
export const PATCH = withAuth(async (req, ctx, _user) => {
    const { id } = await ctx.params;
    if (!id)
        return NextResponse.json(
            { success: false, message: "ID tidak valid" },
            { status: 400 }
        );

    const body = await req.json();
    const { action } = body as { action: string };

    if (action !== "reactivate")
        return NextResponse.json(
            { success: false, message: "Action tidak valid" },
            { status: 400 }
        );

    const supabase = getAdmin();

    const { data: existing, error: fetchErr } = await supabase
        .from("cashflow_custom_categories")
        .select("id, is_active")
        .eq("id", id)
        .single();

    if (fetchErr || !existing)
        return NextResponse.json(
            { success: false, message: "Kategori tidak ditemukan" },
            { status: 404 }
        );

    if (existing.is_active)
        return NextResponse.json(
            { success: false, message: "Kategori sudah aktif" },
            { status: 400 }
        );

    const { data: reactivated, error: updateErr } = await supabase
        .from("cashflow_custom_categories")
        .update({ is_active: true })
        .eq("id", id)
        .select(`
            *,
            created_by_user:users!cashflow_custom_categories_created_by_fkey(id, name)
        `)
        .single();

    if (updateErr) {
        console.error("[cashflow-categories PATCH reactivate]", updateErr);
        return NextResponse.json(
            { success: false, message: updateErr.message },
            { status: 500 }
        );
    }

    return NextResponse.json({ success: true, data: reactivated });
}, CASHFLOW_CATEGORY_MANAGE_ROLES);