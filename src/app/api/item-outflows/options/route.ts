// src/app/api/item-outflows/options/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { ITEM_OUTFLOW_ROLES } from "@/lib/permissions";

// Kembalikan semua barang di Data Barang (laptop + aksesoris) utk dropdown.
async function handler(_req: NextRequest, _ctx: unknown, _user: AuthUser) {
    try {
        const [laptopsRes, accessoriesRes] = await Promise.all([
            supabaseAdmin
                .from("laptops")
                .select("id, laptop_name, brand")
                .order("laptop_name", { ascending: true }),
            supabaseAdmin
                .from("accessories")
                .select("id, name, category, brand")
                .order("name", { ascending: true }),
        ]);

        if (laptopsRes.error) throw laptopsRes.error;
        if (accessoriesRes.error) throw accessoriesRes.error;

        const laptops = (laptopsRes.data ?? []).map((l) => ({
            kind: "LAPTOP" as const,
            id: String(l.id),
            name: l.laptop_name as string,
            meta: (l.brand as string) || "",
        }));

        const accessories = (accessoriesRes.data ?? []).map((a) => ({
            kind: "ACCESSORY" as const,
            id: String(a.id),
            name: a.name as string,
            meta: [a.brand as string, a.category as string].filter(Boolean).join(" · "),
        }));

        return NextResponse.json({ success: true, data: [...laptops, ...accessories] });
    } catch (err) {
        console.error("[item-outflows/options][GET]", err);
        return NextResponse.json(
            { success: false, message: "Gagal memuat daftar barang" },
            { status: 500 }
        );
    }
}

export const GET = withAuth(handler, ITEM_OUTFLOW_ROLES);