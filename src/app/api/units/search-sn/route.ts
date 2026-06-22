// src/app/api/units/search-sn/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams.get("q") || "";

    if (q.length < 2) {
        return NextResponse.json({ data: [] });
    }

    // ── Query kedua tabel secara paralel ──────────────────────────────────────
    const [laptopResult, accessoryResult] = await Promise.all([
        supabase
            .from("laptop_units")
            .select(`
                id,
                serial_number,
                grade,
                purchase_price,
                selling_price,
                condition_note,
                status,
                laptops (
                    id,
                    laptop_name
                )
            `)
            .ilike("serial_number", `%${q}%`)
            .eq("status", "SIAP_JUAL")
            .limit(8)
            .order("serial_number"),

        supabase
            .from("accessory_units")
            .select(`
                id,
                serial_number,
                condition,
                buy_price,
                selling_price,
                status,
                notes,
                accessories (
                    id,
                    name,
                    category,
                    brand,
                    spec
                )
            `)
            .ilike("serial_number", `%${q}%`)
            .eq("status", "TERSEDIA")
            .limit(8)
            .order("serial_number"),
    ]);

    if (laptopResult.error) console.error("search-sn laptop error:", laptopResult.error);
    if (accessoryResult.error) console.error("search-sn accessory error:", accessoryResult.error);

    // ── Format laptop units ───────────────────────────────────────────────────
    const laptopFormatted = (laptopResult.data || []).map((u: any) => ({
        id: u.id,
        serial_number: u.serial_number,
        grade: u.grade,
        purchase_price: u.purchase_price ?? 0,
        selling_price: u.selling_price ?? 0,
        condition_note: u.condition_note ?? "",
        status: u.status,
        laptop_id: u.laptops?.id ?? "",
        laptop_name: u.laptops?.laptop_name ?? "",
        // Penanda tipe — dipakai di frontend untuk render berbeda
        unit_type: "laptop" as const,
    }));

    // ── Format accessory units ────────────────────────────────────────────────
    const accessoryFormatted = (accessoryResult.data || []).map((u: any) => {
        const acc = u.accessories;
        // Buat display_name yang representatif (mirip format laptop)
        const displayName = [acc?.name, acc?.brand, acc?.spec]
            .filter(Boolean).join(" ");
        return {
            id: u.id,
            serial_number: u.serial_number,
            grade: null,                        // aksesori tidak punya grade
            purchase_price: u.buy_price ?? 0,
            selling_price: u.selling_price ?? 0,
            condition_note: u.notes ?? "",
            status: u.status,
            laptop_id: acc?.id ?? "",           // diisi accessory_id supaya konsisten
            laptop_name: displayName,           // diisi display name aksesori
            // Data tambahan khusus aksesori
            unit_type: "accessory" as const,
            accessory_id: acc?.id ?? "",
            accessory_name: acc?.name ?? "",
            category: acc?.category ?? "",
            condition: u.condition,             // BARU | BEKAS
        };
    });

    // ── Merge, laptop dulu kemudian aksesori, total max 10 ───────────────────
    const merged = [...laptopFormatted, ...accessoryFormatted].slice(0, 10);

    return NextResponse.json({ data: merged });
}