// src/app/api/accessory-units/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth } from "@/lib/auth";
import { UserRole } from "@/lib/permissions";

const EDIT_ROLES: UserRole[] = [
    "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
    "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG",
    "TEKNISI", "KEPALA_TEKNISI",
];

export const PATCH = withAuth(async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: "Body tidak valid" }, { status: 400 }); }

    const { serial_number, condition, status, selling_price, buy_price, notes } = body as Record<string, unknown>;

    const updates: Record<string, unknown> = {};

    if (typeof serial_number === "string" && serial_number.trim()) {
        const { count } = await supabaseAdmin
            .from("accessory_units")
            .select("id", { count: "exact", head: true })
            .eq("serial_number", serial_number.trim().toUpperCase())
            .neq("id", id);

        if (count && count > 0) {
            return NextResponse.json({
                success: false,
                error: `Serial number "${serial_number.trim().toUpperCase()}" sudah digunakan`
            }, { status: 400 });
        }
        updates.serial_number = serial_number.trim().toUpperCase();
    }

    if (typeof condition === "string" && ["BARU", "BEKAS"].includes(condition)) updates.condition = condition;
    if (typeof status === "string" && ["TERSEDIA", "TERJUAL", "RESERVED"].includes(status)) updates.status = status;
    if (typeof buy_price === "number") updates.buy_price = Math.max(0, buy_price);
    if (typeof selling_price === "number") updates.selling_price = Math.max(0, selling_price);
    if (typeof notes === "string") updates.notes = notes.trim() || null;

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ success: false, error: "Tidak ada data yang diubah" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
        .from("accessory_units")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data });
}, EDIT_ROLES);

export const DELETE = withAuth(async (
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const { id } = await params;

    const { data: unit } = await supabaseAdmin
        .from("accessory_units")
        .select("status")
        .eq("id", id)
        .maybeSingle();

    if (unit?.status === "TERJUAL") {
        return NextResponse.json({
            success: false,
            error: "Unit yang sudah terjual tidak bisa dihapus"
        }, { status: 400 });
    }

    const { error } = await supabaseAdmin
        .from("accessory_units")
        .delete()
        .eq("id", id);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
}, EDIT_ROLES);