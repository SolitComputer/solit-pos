// src/app/api/cashflow-categories/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import {
    CASHFLOW_ROLES,
    CASHFLOW_CATEGORY_MANAGE_ROLES,
} from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
    CASHFLOW_CATEGORIES,
    MANUAL_INCOME_ONLY_CATEGORIES,
    MANUAL_EXPENSE_ONLY_CATEGORIES,
    KASBON_CICILAN_CATEGORIES,
    AUTO_INCOME_CATEGORIES,
} from "@/lib/cashflow";
// ⬅️ DIHAPUS: ACCOUNT_MAP (hardcoded) tidak lagi dipakai untuk validasi akun.
// Sekarang validasi langsung query ke DB table `accounts` — satu sumber dengan
// dropdown di CategoryManagerModal (yang fetch dari /api/akutansi/accounts) dan
// halaman Kelola Akun. Alasan: akun custom (bikin user di Kelola Akun) & akun
// bawaan yang nama/tipenya berbeda di DB vs hardcoded tidak ada di ACCOUNT_MAP,
// jadi validasi hardcoded selalu reject — termasuk kasus akun 301 Modal Owner.

function getAdmin(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

// ⬅️ Semua key kategori yang hardcoded di cashflow.ts — dipakai untuk mencegah
// user bikin kategori custom dengan key yang nabrak. Mis. user bikin label
// "Belanja Laptop" → key-nya akan jadi "BELANJA_LAPTOP" yang NABRAK dengan
// kategori hardcoded existing. Tolak sebelum insert.
function getHardcodedKeys(): Set<string> {
    return new Set<string>([
        ...Object.keys(CASHFLOW_CATEGORIES),
        ...Object.keys(MANUAL_INCOME_ONLY_CATEGORIES),
        ...Object.keys(MANUAL_EXPENSE_ONLY_CATEGORIES),
        ...Object.keys(KASBON_CICILAN_CATEGORIES),
        ...(AUTO_INCOME_CATEGORIES as readonly string[]),
        "MODAL_AWAL", // khusus — bukan di object manapun tapi reserved
    ]);
}

// ⬅️ Generate key dari label: uppercase, spasi → underscore, buang karakter
// aneh. "Biaya Sewa Ruko!" → "BIAYA_SEWA_RUKO". Konsisten dengan naming
// convention key hardcoded existing.
function generateKey(label: string): string {
    return label
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9\s_]/g, "") // hanya huruf, angka, spasi, underscore
        .replace(/\s+/g, "_")           // spasi → underscore
        .replace(/_+/g, "_")            // underscore berulang → 1
        .replace(/^_|_$/g, "");         // buang underscore di awal/akhir
}

// ── GET /api/cashflow-categories ───────────────────────────────────────────
// SEMUA role yang bisa akses Cashflow boleh baca daftar kategori custom —
// karena dropdown kategori di Tambah/Edit Uang Masuk/Keluar butuh ini juga.
export const GET = withAuth(async (_req, _ctx, _user) => {
    const supabase = getAdmin();

    const { data, error } = await supabase
        .from("cashflow_custom_categories")
        .select(`
            id, key, label, account_code, direction, is_active, created_at, updated_at,
            created_by_user:users!cashflow_custom_categories_created_by_fkey(id, name)
        `)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("[cashflow-categories GET]", error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }

    return NextResponse.json({ success: true, data: data ?? [] });
}, CASHFLOW_ROLES);

// ── POST /api/cashflow-categories ──────────────────────────────────────────
// Hanya ADMIN & ACCOUNTING yang boleh bikin kategori custom baru.
export const POST = withAuth(async (req, _ctx, user: any) => {
    const body = await req.json();
    const { label, account_code, direction } = body as {
        label: string;
        account_code: string;
        direction: string;
    };

    // ── Validasi dasar ──
    const trimmedLabel = (label ?? "").trim();
    if (!trimmedLabel)
        return NextResponse.json(
            { success: false, message: "Nama kategori wajib diisi" },
            { status: 400 }
        );
    if (trimmedLabel.length > 100)
        return NextResponse.json(
            { success: false, message: "Nama kategori maksimal 100 karakter" },
            { status: 400 }
        );

    // ⬅️ UPDATE: validasi akun langsung ke DB (table `accounts`), bukan ACCOUNT_MAP
    // hardcoded. Supaya akun custom & akun bawaan apa pun yang tercatat di DB bisa
    // dipakai, konsisten dengan dropdown di CategoryManagerModal yang fetch dari
    // /api/akutansi/accounts (sumber data yang sama).
    if (!account_code) {
        return NextResponse.json(
            { success: false, message: "Akun akuntansi wajib dipilih" },
            { status: 400 }
        );
    }
    const supabaseForAccountCheck = getAdmin();
    const { data: accountFromDB, error: accCheckErr } = await supabaseForAccountCheck
        .from("accounts")
        .select("code, name, is_active")
        .eq("code", account_code)
        .maybeSingle();

    if (accCheckErr) {
        console.error("[cashflow-categories POST account check]", accCheckErr);
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
            { success: false, message: `Akun ${accountFromDB.code} — ${accountFromDB.name} sudah diarsipkan — tidak bisa dipakai untuk kategori baru` },
            { status: 400 }
        );
    }

    // Validasi direction
    if (!["IN", "OUT", "BOTH"].includes(direction))
        return NextResponse.json(
            { success: false, message: "Arah kategori harus IN, OUT, atau BOTH" },
            { status: 400 }
        );

    // ── Generate & validasi key ──
    const key = generateKey(trimmedLabel);
    if (!key || key.length < 2)
        return NextResponse.json(
            {
                success: false,
                message: "Nama kategori harus mengandung minimal 2 huruf/angka",
            },
            { status: 400 }
        );

    // Cek tabrakan dengan key hardcoded
    if (getHardcodedKeys().has(key))
        return NextResponse.json(
            {
                success: false,
                message: `Nama kategori "${trimmedLabel}" nabrak dengan kategori bawaan sistem. Pakai nama yang beda.`,
            },
            { status: 400 }
        );

    const supabase = getAdmin();

    // Cek duplikat key di tabel custom
    const { data: existing } = await supabase
        .from("cashflow_custom_categories")
        .select("id, is_active, label")
        .eq("key", key)
        .maybeSingle();

    if (existing) {
        if (existing.is_active)
            return NextResponse.json(
                {
                    success: false,
                    message: `Kategori "${existing.label}" sudah ada. Pakai nama yang beda.`,
                },
                { status: 400 }
            );
        // Kalau existing tapi is_active=false (soft-deleted), aktifkan kembali
        // dengan data baru — supaya user tidak terkunci karena nama sudah
        // pernah dipakai lalu diarsipkan.
        const { data: reactivated, error: reactivateErr } = await supabase
            .from("cashflow_custom_categories")
            .update({
                label: trimmedLabel,
                account_code,
                direction,
                is_active: true,
            })
            .eq("id", existing.id)
            .select(`
                *,
                created_by_user:users!cashflow_custom_categories_created_by_fkey(id, name)
            `)
            .single();

        if (reactivateErr) {
            console.error("[cashflow-categories POST reactivate]", reactivateErr);
            return NextResponse.json(
                { success: false, message: reactivateErr.message },
                { status: 500 }
            );
        }
        return NextResponse.json(
            { success: true, data: reactivated, reactivated: true },
            { status: 201 }
        );
    }

    // ── Insert baru ──
    const { data: inserted, error: insertErr } = await supabase
        .from("cashflow_custom_categories")
        .insert({
            key,
            label: trimmedLabel,
            account_code,
            direction,
            is_active: true,
            created_by: user.id,
        })
        .select(`
            *,
            created_by_user:users!cashflow_custom_categories_created_by_fkey(id, name)
        `)
        .single();

    if (insertErr) {
        console.error("[cashflow-categories POST]", insertErr);
        return NextResponse.json(
            { success: false, message: insertErr.message },
            { status: 500 }
        );
    }

    return NextResponse.json({ success: true, data: inserted }, { status: 201 });
}, CASHFLOW_CATEGORY_MANAGE_ROLES);