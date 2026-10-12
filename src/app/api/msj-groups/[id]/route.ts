// src/app/api/msj-groups/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth } from "@/lib/auth";
import { MSJ_GROUP_VIEW_ROLES, MSJ_GROUP_MANAGE_ROLES } from "@/lib/permissions";

// ─── GET /api/msj-groups/[id] ─────────────────────────────────────────────
export const GET = withAuth(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { data: group, error } = await supabaseAdmin.from("msj_groups").select("*").eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!group) return NextResponse.json({ success: false, error: "Kelompok tidak ditemukan" }, { status: 404 });

    const [lapRes, accRes] = await Promise.all([
        supabaseAdmin.from("laptop_units")
            .select("id, serial_number, selling_price, status, laptops(id, laptop_name, brand)").eq("msj_group_id", id),
        supabaseAdmin.from("accessory_units")
            .select("id, serial_number, selling_price, status, accessories(id, name, category, brand)").eq("msj_group_id", id),
    ]);
    if (lapRes.error) return NextResponse.json({ success: false, error: lapRes.error.message }, { status: 500 });
    if (accRes.error) return NextResponse.json({ success: false, error: accRes.error.message }, { status: 500 });

    const items = [
        ...(lapRes.data ?? []).map((u: any) => ({
            item_type: "LAPTOP", unit_id: u.id, serial_number: u.serial_number,
            parent_id: u.laptops?.id ?? null, // laptop_id master — dipakai payment borong
            name: u.laptops?.laptop_name ?? "—", brand: u.laptops?.brand ?? "", selling_price: u.selling_price ?? 0, status: u.status,
        })),
        ...(accRes.data ?? []).map((u: any) => ({
            item_type: "ACCESSORY", unit_id: u.id, serial_number: u.serial_number,
            parent_id: u.accessories?.id ?? null, // accessory_id master
            name: u.accessories?.name ?? "—", brand: u.accessories?.brand ?? "", selling_price: u.selling_price ?? 0, status: u.status,
        })),
    ];

    return NextResponse.json({
        success: true,
        data: { ...group, items, item_count: items.length, total_selling: items.reduce((s, it) => s + (it.selling_price || 0), 0) },
    });
}, MSJ_GROUP_VIEW_ROLES);

// ─── PATCH /api/msj-groups/[id] ───────────────────────────────────────────
// { name } rename · { add:[{item_type,unit_id}] } tambah unit (guard sama
// dengan POST) · { remove:[{item_type,unit_id}] } keluarkan unit (dilepas,
// barang TIDAK dihapus → balik ke Data Barang).
export const PATCH = withAuth(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    let body: any;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: "Body tidak valid" }, { status: 400 }); }

    const { data: group } = await supabaseAdmin.from("msj_groups").select("id, status").eq("id", id).maybeSingle();
    if (!group) return NextResponse.json({ success: false, error: "Kelompok tidak ditemukan" }, { status: 404 });
    if (group.status === "SOLD")
        return NextResponse.json({ success: false, error: "Kelompok sudah terjual, tidak bisa diubah" }, { status: 400 });

    if (typeof body.name === "string" && body.name.trim()) {
        const { error } = await supabaseAdmin.from("msj_groups").update({ name: body.name.trim() }).eq("id", id);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (Array.isArray(body.add) && body.add.length > 0) {
        const lapIds = body.add.filter((i: any) => i.item_type === "LAPTOP").map((i: any) => String(i.unit_id));
        const accIds = body.add.filter((i: any) => i.item_type === "ACCESSORY").map((i: any) => String(i.unit_id));
        if (lapIds.length > 0) {
            const { data, error } = await supabaseAdmin.from("laptop_units")
                .update({ msj_group_id: id }).in("id", lapIds).eq("status", "MINUS_SIAP_JUAL").is("msj_group_id", null).select("id");
            if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
            if ((data ?? []).length !== lapIds.length)
                return NextResponse.json({ success: false, error: "Sebagian SN laptop sudah dikelompokkan / bukan Minus Siap Jual." }, { status: 409 });
        }
        if (accIds.length > 0) {
            const { data, error } = await supabaseAdmin.from("accessory_units")
                .update({ msj_group_id: id }).in("id", accIds).eq("status", "MINUS_SIAP_JUAL").is("msj_group_id", null).select("id");
            if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
            if ((data ?? []).length !== accIds.length)
                return NextResponse.json({ success: false, error: "Sebagian SN aksesoris sudah dikelompokkan / bukan Minus Siap Jual." }, { status: 409 });
        }
    }

    if (Array.isArray(body.remove) && body.remove.length > 0) {
        const lapIds = body.remove.filter((i: any) => i.item_type === "LAPTOP").map((i: any) => String(i.unit_id));
        const accIds = body.remove.filter((i: any) => i.item_type === "ACCESSORY").map((i: any) => String(i.unit_id));
        if (lapIds.length > 0) await supabaseAdmin.from("laptop_units").update({ msj_group_id: null }).in("id", lapIds).eq("msj_group_id", id);
        if (accIds.length > 0) await supabaseAdmin.from("accessory_units").update({ msj_group_id: null }).in("id", accIds).eq("msj_group_id", id);
    }

    return NextResponse.json({ success: true });
}, MSJ_GROUP_MANAGE_ROLES);

// ─── DELETE /api/msj-groups/[id] ──────────────────────────────────────────
// Hapus kelompok. Unit DILEPAS (msj_group_id → null), barang TIDAK dihapus →
// otomatis balik muncul di Data Barang sebagai MSJ belum dikelompokkan.
export const DELETE = withAuth(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    await Promise.all([
        supabaseAdmin.from("laptop_units").update({ msj_group_id: null }).eq("msj_group_id", id),
        supabaseAdmin.from("accessory_units").update({ msj_group_id: null }).eq("msj_group_id", id),
    ]);
    const { error } = await supabaseAdmin.from("msj_groups").delete().eq("id", id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}, MSJ_GROUP_MANAGE_ROLES);