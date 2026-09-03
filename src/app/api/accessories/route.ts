// src/app/api/accessories/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { ACCESSORY_VIEW_ROLES, ACCESSORY_CREATE_ROLES, expandRolesWithParents, BARANG_PRIVATE_VIEW_ROLES, hasAnyRole } from "@/lib/permissions";
import { checkDynamicPageAccess } from "@/lib/dynamicPermissions";

// ── Sanitasi term sebelum ditaruh mentah di string filter PostgREST (.or()) ──
// Karakter koma/kurung punya arti khusus di syntax filter Supabase — kalau
// tidak dibuang, user bisa menyisipkan kondisi filter tambahan lewat kotak
// pencarian (filter injection).
function sanitizeFilterTerm(raw: string): string {
    return raw.replace(/[,()]/g, "").trim();
}

// ─── GET /api/accessories ─────────────────────────────────────────────────────
export const GET = withAuth(async (req: NextRequest, _ctx: unknown, user: AuthUser) => {
    const { searchParams } = new URL(req.url);
    const search = sanitizeFilterTerm(searchParams.get("search")?.trim() ?? "");
    const category = searchParams.get("category") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(10000, parseInt(searchParams.get("limit") ?? "20", 10));
    const offset = (page - 1) * limit;

        let query = supabaseAdmin
        .from("accessories")
        .select("*, accessory_units(*)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

    if (search) query = query.or(`name.ilike.%${search}%,brand.ilike.%${search}%,spec.ilike.%${search}%`);
    if (category) query = query.eq("category", category);

    const { data, error, count } = await query;
    if (error) {
        console.error("[GET /api/accessories]", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // stock_tersedia/stock_total tetap dikirim untuk kompatibilitas UI lama
    // ✅ SECURITY FIX: ACCESSORY_VIEW_ROLES mencakup role sales (CREW_SALES,
    // CUSTOMER_SERVICE) yang tidak boleh lihat buy_price — dulu select("*")
    // dikirim mentah tanpa masking sama sekali.
       const canSeePrivate = hasAnyRole(user.roles ?? [user.role], BARANG_PRIVATE_VIEW_ROLES);
    const enriched = (data ?? []).map(acc => {
        const units = (acc as any).accessory_units ?? [];
        // Aksesori yang SUDAH punya unit ber-SN: stock dihitung dari jumlah unit
        // berstatus TERSEDIA (bukan kolom accessories.stock manual lagi) — biar
        // konsisten dgn recalcAccessoryParentStock() di endpoint unit baru.
        // Aksesori yang BELUM pakai SN tetap pakai kolom stock manual seperti
        // biasa — backward compatible, tidak mengubah aksesori yang sudah ada.
        const derivedStock = units.length > 0
            ? units.filter((u: any) => u.status !== "TERJUAL").length
            : Number(acc.stock) || 0;
        const base: Record<string, any> = {
            ...acc,
            accessory_units: units,
            stock: derivedStock,
            stock_tersedia: derivedStock,
            stock_total: derivedStock,
        };
        if (!canSeePrivate) {
            delete base.buy_price;
            base.accessory_units = units.map((u: any) => {
                const { buy_price, ...rest } = u;
                return rest;
            });
        }
        return base;
    });

    return NextResponse.json({ success: true, data: enriched, total: count ?? 0, page, limit });
}, ACCESSORY_VIEW_ROLES);

// ─── POST /api/accessories ────────────────────────────────────────────────────
async function postHandler(req: NextRequest, _ctx: unknown, user: AuthUser) {
    const effectiveRoles = expandRolesWithParents(user.roles ?? [user.role]);
    const hasStaticAccess = effectiveRoles.some(r => (ACCESSORY_CREATE_ROLES as string[]).includes(r));
    if (!hasStaticAccess) {
        const dyn = await checkDynamicPageAccess(effectiveRoles, "/dashboard/data-barang", "create");
        if (!dyn.allowed) {
            return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
        }
    }

    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: "Body tidak valid" }, { status: 400 }); }

    const { name, category, brand, spec, buy_price, sell_price, stock, notes } =
        body as Record<string, unknown>;

    if (!name || typeof name !== "string" || !name.trim())
        return NextResponse.json({ success: false, error: "Nama aksesori wajib diisi" }, { status: 400 });
    if (!category || typeof category !== "string")
        return NextResponse.json({ success: false, error: "Kategori wajib dipilih" }, { status: 400 });

    const payload = {
        name: name.trim(),
        category: category.trim().toUpperCase(),
        brand: typeof brand === "string" ? brand.trim() || null : null,
        spec: typeof spec === "string" ? spec.trim() || null : null,
        buy_price: typeof buy_price === "number" ? Math.max(0, buy_price) : 0,
        sell_price: typeof sell_price === "number" ? Math.max(0, sell_price) : 0,
        stock: typeof stock === "number" ? Math.max(0, Math.trunc(stock)) : 0,
        notes: typeof notes === "string" ? notes.trim() || null : null,
    };

    const { data, error } = await supabaseAdmin.from("accessories").insert(payload).select().single();
    if (error) {
        console.error("[POST /api/accessories]", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data }, { status: 201 });
}

export const POST = withAuth(postHandler);