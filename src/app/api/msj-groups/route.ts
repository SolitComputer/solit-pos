// src/app/api/msj-groups/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { MSJ_GROUP_VIEW_ROLES, MSJ_GROUP_MANAGE_ROLES } from "@/lib/permissions";

type GroupItem = { item_type: "LAPTOP" | "ACCESSORY"; unit_id: string };

// ─── GET /api/msj-groups ──────────────────────────────────────────────────
// Daftar semua kelompok + isinya (unit yang msj_group_id-nya menunjuk ke
// kelompok itu). Dipakai di halaman Minus Siap Jual & di payment ("panggil
// kelompok"). Tidak mengirim harga modal → aman untuk role sales.
export const GET = withAuth(async (req: NextRequest) => {
    const statusFilter = new URL(req.url).searchParams.get("status"); // opsional: OPEN | SOLD

    let gq = supabaseAdmin.from("msj_groups").select("*").order("created_at", { ascending: false });
    if (statusFilter) gq = gq.eq("status", statusFilter);

    const { data: groups, error: gErr } = await gq;
    if (gErr) return NextResponse.json({ success: false, error: gErr.message }, { status: 500 });

    const groupIds = (groups ?? []).map((g: any) => g.id);
    if (groupIds.length === 0) return NextResponse.json({ success: true, data: [] });

    const [lapRes, accRes] = await Promise.all([
        supabaseAdmin.from("laptop_units")
            .select("id, serial_number, selling_price, status, msj_group_id, laptops(id, laptop_name, brand)")
            .in("msj_group_id", groupIds),
        supabaseAdmin.from("accessory_units")
            .select("id, serial_number, selling_price, status, msj_group_id, accessories(id, name, category, brand)")
            .in("msj_group_id", groupIds),
    ]);
    if (lapRes.error) return NextResponse.json({ success: false, error: lapRes.error.message }, { status: 500 });
    if (accRes.error) return NextResponse.json({ success: false, error: accRes.error.message }, { status: 500 });

    const byGroup = new Map<string, any[]>();
    const push = (gid: string, item: any) => { const a = byGroup.get(gid) ?? []; a.push(item); byGroup.set(gid, a); };

    for (const u of lapRes.data ?? []) push(u.msj_group_id, {
        item_type: "LAPTOP", unit_id: u.id, serial_number: u.serial_number,
        parent_id: (u.laptops as any)?.id ?? null, // laptop_id master — dipakai payment borong
        name: (u.laptops as any)?.laptop_name ?? "—", brand: (u.laptops as any)?.brand ?? "",
        selling_price: u.selling_price ?? 0, status: u.status,
    });
    for (const u of accRes.data ?? []) push(u.msj_group_id, {
        item_type: "ACCESSORY", unit_id: u.id, serial_number: u.serial_number,
        parent_id: (u.accessories as any)?.id ?? null, // accessory_id master
        name: (u.accessories as any)?.name ?? "—", brand: (u.accessories as any)?.brand ?? "",
        selling_price: u.selling_price ?? 0, status: u.status,
    });
 
    const data = (groups ?? []).map((g: any) => {
        const items = byGroup.get(g.id) ?? [];
        return { ...g, items, item_count: items.length, total_selling: items.reduce((s, it) => s + (it.selling_price || 0), 0) };
    });

    return NextResponse.json({ success: true, data });
}, MSJ_GROUP_VIEW_ROLES);

// ─── POST /api/msj-groups ─────────────────────────────────────────────────
// Buat kelompok + masukkan unit terpilih. Hanya unit berstatus MINUS_SIAP_JUAL
// yang BELUM masuk kelompok (msj_group_id IS NULL) yang boleh diklaim — guard
// ini bikin 2 orang tidak bisa menaruh SN yang sama ke 2 kelompok, sekaligus
// menolak unit yang statusnya bukan MSJ. Pola klaim atomik meniru
// transaction/create (filter di WHERE update, lalu bandingkan jumlah).
export const POST = withAuth(async (req: NextRequest, _ctx: unknown, user: AuthUser) => {
    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: "Body tidak valid" }, { status: 400 }); }

    const { name, items } = body as { name?: unknown; items?: unknown };
    if (!name || typeof name !== "string" || !name.trim())
        return NextResponse.json({ success: false, error: "Nama kelompok wajib diisi" }, { status: 400 });
    if (!Array.isArray(items) || items.length === 0)
        return NextResponse.json({ success: false, error: "Minimal 1 barang (SN) harus dipilih" }, { status: 400 });

    const clean: GroupItem[] = [];
    for (const it of items as any[]) {
        if (!it?.unit_id || (it.item_type !== "LAPTOP" && it.item_type !== "ACCESSORY"))
            return NextResponse.json({ success: false, error: "Item tidak valid (unit_id/item_type)" }, { status: 400 });
        clean.push({ item_type: it.item_type, unit_id: String(it.unit_id) });
    }

    const { data: group, error: gErr } = await supabaseAdmin
        .from("msj_groups").insert({ name: name.trim(), created_by: user.id }).select().single();
    if (gErr) return NextResponse.json({ success: false, error: gErr.message }, { status: 500 });

    const lapIds = clean.filter(i => i.item_type === "LAPTOP").map(i => i.unit_id);
    const accIds = clean.filter(i => i.item_type === "ACCESSORY").map(i => i.unit_id);
    const claimed = { laptop: [] as string[], accessory: [] as string[] };

    try {
        if (lapIds.length > 0) {
            const { data, error } = await supabaseAdmin.from("laptop_units")
                .update({ msj_group_id: group.id }).in("id", lapIds)
                .eq("status", "MINUS_SIAP_JUAL").is("msj_group_id", null).select("id");
            if (error) throw error;
            claimed.laptop = (data ?? []).map((r: any) => r.id);
        }
        if (accIds.length > 0) {
            const { data, error } = await supabaseAdmin.from("accessory_units")
                .update({ msj_group_id: group.id }).in("id", accIds)
                .eq("status", "MINUS_SIAP_JUAL").is("msj_group_id", null).select("id");
            if (error) throw error;
            claimed.accessory = (data ?? []).map((r: any) => r.id);
        }
    } catch (e: any) {
        await releaseAndDeleteGroup(group.id, claimed.laptop, claimed.accessory);
        return NextResponse.json({ success: false, error: e?.message ?? "Gagal memasukkan unit" }, { status: 500 });
    }

    if (claimed.laptop.length !== lapIds.length || claimed.accessory.length !== accIds.length) {
        await releaseAndDeleteGroup(group.id, claimed.laptop, claimed.accessory);
        return NextResponse.json({
            success: false,
            error: "Sebagian SN sudah masuk kelompok lain atau statusnya bukan Minus Siap Jual. Refresh & coba lagi.",
        }, { status: 409 });
    }

    return NextResponse.json({ success: true, data: group }, { status: 201 });
}, MSJ_GROUP_MANAGE_ROLES);

async function releaseAndDeleteGroup(groupId: string, lapIds: string[], accIds: string[]) {
    if (lapIds.length > 0) await supabaseAdmin.from("laptop_units").update({ msj_group_id: null }).in("id", lapIds);
    if (accIds.length > 0) await supabaseAdmin.from("accessory_units").update({ msj_group_id: null }).in("id", accIds);
    await supabaseAdmin.from("msj_groups").delete().eq("id", groupId);
}