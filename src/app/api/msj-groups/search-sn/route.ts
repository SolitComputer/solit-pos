// src/app/api/msj-groups/search-sn/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth } from "@/lib/auth";
import { MSJ_GROUP_VIEW_ROLES } from "@/lib/permissions";

// GET /api/msj-groups/search-sn?q=xxx
// HANYA unit berstatus MINUS_SIAP_JUAL yang BELUM masuk kelompok
// (msj_group_id IS NULL), laptop + aksesoris digabung. Dipakai di modal
// "Tambah Kelompok" — isolasi inilah yang bikin SN yang sudah dikelompokkan
// tidak bisa dipilih lagi (requirement #4).
export const GET = withAuth(async (req: NextRequest) => {
    const q = (new URL(req.url).searchParams.get("q") || "").trim();
    if (q.length < 2) return NextResponse.json({ success: true, data: [] });

    const [lapRes, accRes] = await Promise.all([
        supabaseAdmin.from("laptop_units")
            .select("id, serial_number, selling_price, laptops(id, laptop_name, brand)")
            .ilike("serial_number", `%${q}%`).eq("status", "MINUS_SIAP_JUAL").is("msj_group_id", null).limit(10),
        supabaseAdmin.from("accessory_units")
            .select("id, serial_number, selling_price, accessories(id, name, category, brand)")
            .ilike("serial_number", `%${q}%`).eq("status", "MINUS_SIAP_JUAL").is("msj_group_id", null).limit(10),
    ]);
    if (lapRes.error) return NextResponse.json({ success: false, error: lapRes.error.message }, { status: 500 });
    if (accRes.error) return NextResponse.json({ success: false, error: accRes.error.message }, { status: 500 });

    const data = [
        ...(lapRes.data ?? []).filter((u: any) => u.laptops?.id).map((u: any) => ({
            item_type: "LAPTOP" as const, unit_id: u.id, serial_number: u.serial_number,
            name: u.laptops.laptop_name, brand: u.laptops.brand ?? "", selling_price: u.selling_price ?? 0,
        })),
        ...(accRes.data ?? []).filter((u: any) => u.accessories?.id).map((u: any) => ({
            item_type: "ACCESSORY" as const, unit_id: u.id, serial_number: u.serial_number,
            name: u.accessories.name, brand: u.accessories.brand ?? "", selling_price: u.selling_price ?? 0,
        })),
    ].slice(0, 15);

    return NextResponse.json({ success: true, data });
}, MSJ_GROUP_VIEW_ROLES);