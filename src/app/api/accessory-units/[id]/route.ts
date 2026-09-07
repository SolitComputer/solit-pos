// src/app/api/accessory-units/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { UserRole } from "@/lib/permissions";
import { recordOutflow } from "@/lib/accessoryOutflow";
import { recalcAccessoryParentStock } from "@/lib/accessoryStock";

const EDIT_ROLES: UserRole[] = [
    "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
    "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG",
    "TEKNISI", "KEPALA_TEKNISI",
];

export const PATCH = withAuth(async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
    user: AuthUser
) => {
    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: "Body tidak valid" }, { status: 400 }); }

    const { serial_number, condition, status, selling_price, buy_price, notes } = body as Record<string, unknown>;
    // ✅ FIX: field "source" DIHAPUS dari endpoint ini — kolom itu kemungkinan
    // besar tidak pernah benar-benar ada di tabel accessory_units (tidak
    // disebut di manapun file-file "asli" kamu), jadi kalau tetap dikirim ke
    // .update() bisa memicu error Postgres "column does not exist". Kalau
    // kamu memang sudah menjalankan migration ADD COLUMN source, kabari saya
    // supaya ditambahkan lagi secara konsisten ke semua endpoint sekaligus.

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

    const { data: oldData } = await supabaseAdmin
        .from("accessory_units")
        .select("status, accessory_id")
        .eq("id", id)
        .single();

    const { data, error } = await supabaseAdmin
        .from("accessory_units")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    // Recalc penuh untuk KEDUA ARAH perubahan status (TERSEDIA→TERJUAL DAN
    // sebaliknya, mis. dibatalkan/retur) — bukan cuma decrement 1 arah.
    if (updates.status && oldData && updates.status !== oldData.status && oldData.accessory_id) {
        await recalcAccessoryParentStock(supabaseAdmin, oldData.accessory_id);
    }

    if (updates.status === "TERJUAL" && oldData && oldData.status !== "TERJUAL") {
        await recordOutflow({
            accessory_id: oldData.accessory_id,
            unit_id: id,
            source_type: "manual",
            qty: 1,
            notes: "Status diubah menjadi TERJUAL via edit unit",
            taken_by_role: "PENGELOLA_BARANG",
            created_by: user.id
        });
    }

    return NextResponse.json({ success: true, data });
}, EDIT_ROLES);

export const DELETE = withAuth(async (
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const { id } = await params;

    const { data: unit } = await supabaseAdmin
        .from("accessory_units")
        .select("status, accessory_id")
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

    if (unit?.accessory_id) {
        await recalcAccessoryParentStock(supabaseAdmin, unit.accessory_id);
    }

    return NextResponse.json({ success: true });
}, EDIT_ROLES);