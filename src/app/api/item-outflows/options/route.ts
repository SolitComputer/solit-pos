import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { ITEM_OUTFLOW_ROLES } from "@/lib/permissions";

// Satu baris = satu UNIT ber-SN yang MASIH tersedia di stok.
// Pengambilan barang sekarang murni per-unit (by SN).
interface MasterItem {
    kind: "LAPTOP" | "ACCESSORY";
    id: string;            // id induk (laptop_id / accessory_id) → dipakai sbg item_ref_id
    name: string;          // nama induk
    meta?: string;
    unit_id: string;       // id unit (SN)
    serial_number: string; // SN unit
}

async function getHandler(_req: NextRequest, _ctx: unknown, _user: AuthUser) {
    try {
        // Unit laptop siap jual
        const { data: laptopUnits, error: luErr } = await supabaseAdmin
            .from("laptop_units")
            .select("id, laptop_id, serial_number, status")
            .eq("status", "SIAP_JUAL")
            .order("created_at", { ascending: false });
        if (luErr) return NextResponse.json({ success: false, message: luErr.message }, { status: 400 });

        // Unit aksesoris tersedia
        const { data: accUnits, error: auErr } = await supabaseAdmin
            .from("accessory_units")
            .select("id, accessory_id, serial_number, status")
            .eq("status", "TERSEDIA")
            .order("created_at", { ascending: false });
        if (auErr) return NextResponse.json({ success: false, message: auErr.message }, { status: 400 });

        // Ambil nama induk sekali jalan (hindari N+1)
        const laptopIds = [...new Set((laptopUnits ?? []).map(u => u.laptop_id).filter(Boolean))];
        const accessoryIds = [...new Set((accUnits ?? []).map(u => u.accessory_id).filter(Boolean))];

        const [{ data: laptops }, { data: accessories }] = await Promise.all([
            laptopIds.length
                ? supabaseAdmin.from("laptops").select("id, laptop_name, brand").in("id", laptopIds)
                : Promise.resolve({ data: [] as any[] }),
            accessoryIds.length
                ? supabaseAdmin.from("accessories").select("id, name, category").in("id", accessoryIds)
                : Promise.resolve({ data: [] as any[] }),
        ]);

        const laptopMap = new Map((laptops ?? []).map((l: any) => [l.id, l]));
        const accessoryMap = new Map((accessories ?? []).map((a: any) => [a.id, a]));

        const laptopOptions: MasterItem[] = (laptopUnits ?? [])
            .filter(u => u.serial_number && u.laptop_id)
            .map(u => {
                const p = laptopMap.get(u.laptop_id);
                return { kind: "LAPTOP", id: u.laptop_id, name: p?.laptop_name ?? "Laptop", meta: p?.brand ?? undefined, unit_id: u.id, serial_number: u.serial_number };
            });

        const accessoryOptions: MasterItem[] = (accUnits ?? [])
            .filter(u => u.serial_number && u.accessory_id)
            .map(u => {
                const p = accessoryMap.get(u.accessory_id);
                return { kind: "ACCESSORY", id: u.accessory_id, name: p?.name ?? "Aksesoris", meta: p?.category ?? undefined, unit_id: u.id, serial_number: u.serial_number };
            });

        return NextResponse.json({ success: true, data: [...laptopOptions, ...accessoryOptions] });
    } catch (err) {
        console.error("[item-outflows/options][GET]", err);
        return NextResponse.json({ success: false, message: "Terjadi kesalahan server" }, { status: 500 });
    }
}

export const GET = withAuth(getHandler, ITEM_OUTFLOW_ROLES);