// src/app/api/accessory-units/search-sn/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth } from "@/lib/auth";
import { UserRole } from "@/lib/permissions";

const ALLOWED_ROLES: UserRole[] = [
    "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
    "KEPALA_SALES", "CREW_SALES", "SOTECH",
    "PENGANTARAN", "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
    "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG",
    "TEKNISI", "KEPALA_TEKNISI",
    "ACCOUNTING", "PKL",
];

// GET /api/accessory-units/search-sn?q=xxx
export const GET = withAuth(async (req: NextRequest) => {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";

    if (q.length < 2) {
        return NextResponse.json({ success: true, data: [] });
    }

    const { data, error } = await supabaseAdmin
        .from("accessory_units")
        .select(`
      id,
      serial_number,
      condition,
      status,
      selling_price,
      notes,
     accessories(
        id,
        name,
        category,
        brand,
        spec
      )
    `)
        .ilike("serial_number", `%${q}%`)
        .eq("status", "TERSEDIA")
        .limit(10);

    if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Flatten untuk konsumsi di frontend (mirip format laptop units)
    const flattened = (data ?? []).map((u: any) => ({
        id: u.id,
        serial_number: u.serial_number,
        condition: u.condition,
        status: u.status,
        selling_price: u.selling_price,
        notes: u.notes,
        accessory_id: u.accessories?.id,
        accessory_name: u.accessories?.name,
        category: u.accessories?.category,
        brand: u.accessories?.brand,
        spec: u.accessories?.spec,
        buy_price: u.buy_price ?? 0,
        display_name: [u.accessories?.name, u.accessories?.brand, u.accessories?.spec]
            .filter(Boolean).join(" "),
    }));

    return NextResponse.json({ success: true, data: flattened });
}, ALLOWED_ROLES);