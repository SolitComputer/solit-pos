// src/app/api/accessories/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth } from "@/lib/auth";
import { UserRole } from "@/lib/permissions";

const VIEW_ROLES: UserRole[] = [
    "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
    "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG",
    "TEKNISI", "KEPALA_TEKNISI",
    "KEPALA_SALES", "CREW_SALES",
    "ACCOUNTING",
];

const EDIT_ROLES: UserRole[] = [
    "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
    "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG",
    "TEKNISI", "KEPALA_TEKNISI",
];

// ─── GET /api/accessories/[id] ────────────────────────────────────────────────
export const GET = withAuth(async (_req, { params }) => {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
        .from("accessories").select("*, units:accessory_units(*)").eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ success: false, error: "Tidak ditemukan" }, { status: 404 });
    return NextResponse.json({ success: true, data });
}, VIEW_ROLES);

// ─── PATCH /api/accessories/[id] ─────────────────────────────────────────────
export const PATCH = withAuth(async (req, { params }) => {
    const { id } = await params;
    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: "Body tidak valid" }, { status: 400 }); }

    const { name, category, brand, spec, buy_price, sell_price, stock, notes } =
        body as Record<string, unknown>;

    const updates: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) updates.name = name.trim();
    if (typeof category === "string" && category.trim()) updates.category = category.trim().toUpperCase();
    if (typeof brand === "string") updates.brand = brand.trim() || null;
    if (typeof spec === "string") updates.spec = spec.trim() || null;
    if (typeof buy_price === "number") updates.buy_price = Math.max(0, buy_price);
    if (typeof sell_price === "number") updates.sell_price = Math.max(0, sell_price);
    if (typeof stock === "number") updates.stock = Math.max(0, Math.trunc(stock));
    if (typeof notes === "string") updates.notes = notes.trim() || null;

    if (Object.keys(updates).length === 0)
        return NextResponse.json({ success: false, error: "Tidak ada data yang diubah" }, { status: 400 });

    const { data, error } = await supabaseAdmin
        .from("accessories").update(updates).eq("id", id).select().single();
    if (error) {
        console.error("[PATCH /api/accessories/[id]]", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data });
}, EDIT_ROLES);

export const DELETE = withAuth(async (_req, { params }) => {
    const { id } = await params;

    const { data: acc } = await supabaseAdmin
        .from("accessories").select("stock").eq("id", id).maybeSingle();

    if (acc && Number(acc.stock) > 0) {
        return NextResponse.json({
            success: false,
            error: `Tidak bisa dihapus, stok masih ${acc.stock}. Set stok ke 0 dulu.`,
        }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("accessories").delete().eq("id", id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}, EDIT_ROLES);