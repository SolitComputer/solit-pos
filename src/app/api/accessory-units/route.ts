// src/app/api/accessory-units/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { UserRole, BARANG_PRIVATE_VIEW_ROLES, hasAnyRole } from "@/lib/permissions";

const VIEW_ROLES: UserRole[] = [
    "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
    "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG",
    "TEKNISI", "KEPALA_TEKNISI",
    "KEPALA_SALES", "CREW_SALES",
    "ACCOUNTING",
];

const CREATE_ROLES: UserRole[] = [
    "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
    "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG",
    "TEKNISI", "KEPALA_TEKNISI",
];

// ─── GET /api/accessory-units?accessory_id=xxx ────────────────────────────────
export const GET = withAuth(async (req: NextRequest, _ctx: unknown, user: AuthUser) => {
    const { searchParams } = new URL(req.url);
    const accessoryId = searchParams.get("accessory_id");
    const status = searchParams.get("status"); // optional filter

    if (!accessoryId) {
        return NextResponse.json({ success: false, error: "accessory_id wajib diisi" }, { status: 400 });
    }

    let query = supabaseAdmin
        .from("accessory_units")
        .select("*")
        .eq("accessory_id", accessoryId)
        .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);

    const { data, error } = await query;

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    // ✅ SECURITY FIX: VIEW_ROLES mencakup CREW_SALES/KEPALA_SALES yang tidak
    // boleh lihat buy_price per unit — dulu select("*") mentah tanpa masking.
    const canSeePrivate = hasAnyRole(user.roles ?? [user.role], BARANG_PRIVATE_VIEW_ROLES);
    const safeData = canSeePrivate
        ? (data ?? [])
        : (data ?? []).map((u: Record<string, any>) => {
            const { buy_price, ...rest } = u;
            return rest;
        });

    return NextResponse.json({ success: true, data: safeData });
}, VIEW_ROLES);

// ─── POST /api/accessory-units ────────────────────────────────────────────────
export const POST = withAuth(async (req: NextRequest) => {
    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: "Body tidak valid" }, { status: 400 }); }

    const { accessory_id, serial_number, condition, buy_price, selling_price, notes } = body as Record<string, unknown>;

    if (!accessory_id || typeof accessory_id !== "string") {
        return NextResponse.json({ success: false, error: "accessory_id wajib diisi" }, { status: 400 });
    }
    if (!serial_number || typeof serial_number !== "string" || !serial_number.trim()) {
        return NextResponse.json({ success: false, error: "Serial number wajib diisi" }, { status: 400 });
    }

    // Cek duplikat SN
    const { count: snExists } = await supabaseAdmin
        .from("accessory_units")
        .select("id", { count: "exact", head: true })
        .eq("serial_number", serial_number.trim().toUpperCase());

    if (snExists && snExists > 0) {
        return NextResponse.json({ success: false, error: `Serial number "${serial_number.trim().toUpperCase()}" sudah digunakan` }, { status: 400 });
    }

    // Ambil harga jual dari master kalau tidak diisi
    let finalSellingPrice = typeof selling_price === "number" ? Math.max(0, selling_price) : 0;
    if (!finalSellingPrice) {
        const { data: master } = await supabaseAdmin
            .from("accessories")
            .select("sell_price")
            .eq("id", accessory_id)
            .maybeSingle();
        finalSellingPrice = master?.sell_price ?? 0;
    }

    const payload = {
        accessory_id,
        serial_number: serial_number.trim().toUpperCase(),
        condition: typeof condition === "string" && ["BARU", "BEKAS"].includes(condition) ? condition : "BARU",
        status: "TERSEDIA",
        buy_price: typeof buy_price === "number" ? Math.max(0, buy_price) : 0,
        selling_price: finalSellingPrice,
        notes: typeof notes === "string" ? notes.trim() || null : null,
    };

    const { data, error } = await supabaseAdmin
        .from("accessory_units")
        .insert(payload)
        .select()
        .single();

    if (error) {
        console.error("[POST /api/accessory-units]", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
}, CREATE_ROLES);