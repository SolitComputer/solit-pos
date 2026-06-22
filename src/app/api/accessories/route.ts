// src/app/api/accessories/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth } from "@/lib/auth";
import { UserRole } from "@/lib/permissions";

const ALLOWED_ROLES: UserRole[] = [
    "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
    "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG",
    "TEKNISI", "KEPALA_TEKNISI",
    "KEPALA_SALES", "CREW_SALES",
    "ACCOUNTING",
];

const CREATE_ROLES: UserRole[] = [
    "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
    "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG",
    "TEKNISI", "KEPALA_TEKNISI",
];

// ─── GET /api/accessories ─────────────────────────────────────────────────────
export const GET = withAuth(async (req: NextRequest) => {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const category = searchParams.get("category") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20", 10));
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
        .from("accessories")
        .select(`
      *,
     accessory_units(
        id, serial_number, condition, status, buy_price, selling_price, notes
      )
    `, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

    if (search) {
        query = query.or(`name.ilike.%${search}%,brand.ilike.%${search}%,spec.ilike.%${search}%`);
    }
    if (category) query = query.eq("category", category);

    const { data, error, count } = await query;

    if (error) {
        console.error("[GET /api/accessories]", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Hitung stok dari units yang TERSEDIA
    const enriched = (data ?? []).map(acc => ({
        ...acc,
        stock_tersedia: (acc.accessory_units ?? []).filter((u: any) => u.status === "TERSEDIA").length,
        stock_total: (acc.accessory_units ?? []).length,
    }));

    return NextResponse.json({
        success: true,
        data: enriched,
        total: count ?? 0,
        page,
        limit,
    });
}, ALLOWED_ROLES);

// ─── POST /api/accessories ────────────────────────────────────────────────────
export const POST = withAuth(async (req: NextRequest) => {
    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: "Body tidak valid" }, { status: 400 }); }

    const {
        name, category, brand, spec,
        buy_price, sell_price, notes,
    } = body as Record<string, unknown>;

    if (!name || typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ success: false, error: "Nama aksesori wajib diisi" }, { status: 400 });
    }
    if (!category || typeof category !== "string") {
        return NextResponse.json({ success: false, error: "Kategori wajib dipilih" }, { status: 400 });
    }

    const payload = {
        name: name.trim(),
        category: category.trim().toUpperCase(),
        brand: typeof brand === "string" ? brand.trim() || null : null,
        spec: typeof spec === "string" ? spec.trim() || null : null,
        sell_price: typeof sell_price === "number" ? Math.max(0, sell_price) : 0,
        notes: typeof notes === "string" ? notes.trim() || null : null,
    };

    const { data, error } = await supabaseAdmin
        .from("accessories")
        .insert(payload)
        .select()
        .single();

    if (error) {
        console.error("[POST /api/accessories]", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
}, CREATE_ROLES);