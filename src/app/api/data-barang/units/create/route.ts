// src/app/api/data-barang/units/create/route.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// FASE 1 — SN-First Add Barang
// Endpoint: POST /api/data-barang/units/create
//
// Flow baru: 1 request = 1 SN lengkap dengan identitas spek.
// Backend auto-cari parent (kotak) existing dengan dedup hash match.
// - Match     → insert SN ke parent itu (masuk folder existing)
// - Tidak match → bikin parent baru + insert SN sebagai penghuni pertama
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { expandRolesWithParents } from "@/lib/permissions";
import { checkDynamicPageAccess } from "@/lib/dynamicPermissions";
import { logActivity } from "@/lib/activityLogger";
import { recalcLaptopParentQty } from "@/lib/laptopStock";
import { recalcAccessoryParentStock } from "@/lib/accessoryStock";
import { computeDedupHash } from "@/lib/dedupHash";
import crypto from "crypto";

// Markup tetap untuk Harga Official (konsisten dgn /api/laptops/[id]/units)
const OFFICIAL_PRICE_MARKUP = 300_000;

// Helper hash aksesoris — 3 field (name+brand+spec). Sengaja DIPISAH dari
// lib/dedupHash supaya aturan dedup aksesoris bisa di-tweak sendiri tanpa
// ganggu dedup laptop.
function computeAccessoryDedupHash(input: {
    name: string | null;
    brand: string | null;
    spec: string | null;
}): string {
    const norm = (s: string | null) => (s ?? "").trim().toLowerCase();
    const raw = `${norm(input.name)}|${norm(input.brand)}|${norm(input.spec)}`;
    return crypto.createHash("sha256").update(raw).digest("hex");
}

async function postHandler(req: NextRequest, _ctx: unknown, user: AuthUser) {
    try {
        // ── Permission check (reuse pola yg sama dgn endpoint create existing) ──
        const effectiveRoles = expandRolesWithParents(user.roles ?? [user.role]);
        const hasStaticAccess = effectiveRoles.some(r =>
            (PERMISSIONS.CREATE_UNITS as string[]).includes(r)
        );
        if (!hasStaticAccess) {
            const dyn = await checkDynamicPageAccess(effectiveRoles, "/dashboard/data-barang", "create");
            if (!dyn.allowed) {
                return NextResponse.json(
                    { success: false, message: "Forbidden" },
                    { status: 403 }
                );
            }
        }

        const body = await req.json();
        const {
            tipe, // "LAPTOP" | "AKSESORIS"
            category_id,
            serial_number,
            // Identitas spek
            name, brand,
            cpu, ram, storage, gpu, display, // laptop only
            spec,                            // aksesoris only
            // Harga & grade per-SN
            grade,                 // laptop: A/B/C
            condition,             // aksesoris: BARU/BEKAS
            purchase_price,        // laptop
            sparepart_cost,        // laptop
            buy_price,             // aksesoris
            selling_price,         // keduanya
            // Per-SN lain
            source, branch, notes,
            condition_note,        // laptop
            kelengkapan,           // laptop
            condition_checks,      // laptop
        } = body;

        // ── Validasi dasar ─────────────────────────────────────────────────
        if (tipe !== "LAPTOP" && tipe !== "AKSESORIS") {
            return NextResponse.json(
                { success: false, message: "Tipe wajib LAPTOP atau AKSESORIS" },
                { status: 400 }
            );
        }
        if (!serial_number || typeof serial_number !== "string" || !serial_number.trim()) {
            return NextResponse.json(
                { success: false, message: "Serial number wajib diisi" },
                { status: 400 }
            );
        }
        if (!name || typeof name !== "string" || !name.trim()) {
            return NextResponse.json(
                { success: false, message: "Nama barang wajib diisi" },
                { status: 400 }
            );
        }

        const safeBranch = branch === "UTAMA" || branch === "JOGJA" ? branch : null;

        // ═══════════════════════════════════════════════════════════════════
        // FLOW LAPTOP
        // ═══════════════════════════════════════════════════════════════════
        if (tipe === "LAPTOP") {
            // 1. Cek duplikat SN GLOBAL
            const { data: existingSn } = await supabaseAdmin
                .from("laptop_units")
                .select("id, serial_number, laptop:laptops(laptop_name)")
                .eq("serial_number", serial_number.trim())
                .limit(1);

            if (existingSn && existingSn.length > 0) {
                const dup = existingSn[0] as any;
                const lap = Array.isArray(dup.laptop) ? dup.laptop[0] : dup.laptop;
                const lokasi = lap?.laptop_name ? ` pada "${lap.laptop_name}"` : "";
                return NextResponse.json({
                    success: false,
                    message: `Serial number "${serial_number}" sudah terdaftar${lokasi}`,
                }, { status: 409 });
            }

            // 2. Compute dedup hash parent (6 field)
            const dedupHash = await computeDedupHash({
                brand: brand ?? null,
                laptop_name: name ?? null,
                cpu: cpu ?? null,
                ram: ram ?? null,
                storage: storage ?? null,
                gpu: gpu ?? null,
            });

            // 3. Cari parent existing
            const { data: existingLaptop } = await supabaseAdmin
                .from("laptops")
                .select("*")
                .eq("dedup_hash", dedupHash)
                .limit(1)
                .maybeSingle();

            let parentLaptopId: string;
            let wasExistingParent = false;

            if (existingLaptop) {
                parentLaptopId = existingLaptop.id;
                wasExistingParent = true;
            } else {
                // 4. Create parent baru
                const sellingPriceNum = selling_price != null && selling_price !== ""
                    ? Math.round(Number(selling_price)) : 0;

                const { data: newParent, error: parentErr } = await supabaseAdmin
                    .from("laptops")
                    .insert({
                        laptop_name: name.trim(),
                        category_id: category_id || null,
                        brand: brand || null,
                        cpu: cpu || null,
                        ram: ram || null,
                        storage: storage || null,
                        gpu: gpu || null,
                        display: display || null,
                        selling_price: sellingPriceNum,
                        qty: 0, // di-recalc setelah unit insert
                        status: "BELUM_SIAP",
                        condition_note: condition_note || null,
                        notes: notes || null,
                        dedup_hash: dedupHash,
                    })
                    .select()
                    .single();

                if (parentErr) throw parentErr;
                parentLaptopId = newParent.id;
            }

            // 5. Insert SN dgn identitas lengkap (SN-first!)
            const purchasePriceNum = purchase_price != null && purchase_price !== ""
                ? Math.round(Number(purchase_price)) : null;
            const sellingPriceNum = selling_price != null && selling_price !== ""
                ? Math.round(Number(selling_price)) : null;
            const sparepartNum = sparepart_cost != null && sparepart_cost !== ""
                ? Math.round(Number(sparepart_cost)) : null;

            const { data: newUnit, error: unitErr } = await supabaseAdmin
                .from("laptop_units")
                .insert({
                    laptop_id: parentLaptopId,
                    serial_number: serial_number.trim(),
                    // Identitas per-SN
                    name: name.trim(),
                    brand: brand || null,
                    cpu: cpu || null,
                    ram: ram || null,
                    storage: storage || null,
                    gpu: gpu || null,
                    display: display || null,
                    // Grade & harga
                    grade: grade || "A",
                    purchase_price: purchasePriceNum,
                    selling_price: sellingPriceNum,
                    sparepart_cost: sparepartNum,
                    official_price: sellingPriceNum != null
                        ? sellingPriceNum + OFFICIAL_PRICE_MARKUP : null,
                    // Status default — ikut flow QC
                    status: "BELUM_SIAP",
                    qc_status: "NEEDS_QC",
                    // Per-SN lain
                    source: source || null,
                    branch: safeBranch,
                    notes: notes || null,
                    condition_note: condition_note?.trim() || null,
                    kelengkapan: kelengkapan ?? null,
                    condition_checks: condition_checks ?? {},
                })
                .select()
                .single();

            if (unitErr) throw unitErr;

            // 6. Recalc parent qty
            await recalcLaptopParentQty(supabaseAdmin, parentLaptopId);

            // 7. Log activity
            try {
                await logActivity({
                    userId: user.id,
                    userName: user.name,
                    userRole: user.role,
                    action: "CREATE",
                    entity: "unit",
                    entityId: newUnit.id,
                    entityLabel: `SN: ${newUnit.serial_number} (${name})${wasExistingParent ? " — masuk folder existing" : " — folder baru"}`,
                    afterData: newUnit,
                });
            } catch { /* non-blocking */ }

            return NextResponse.json({
                success: true,
                data: {
                    unit: newUnit,
                    parent_id: parentLaptopId,
                    was_existing_parent: wasExistingParent,
                },
                message: wasExistingParent
                    ? `SN masuk ke folder existing "${name}"`
                    : `Folder "${name}" baru dibuat + SN pertama masuk`,
            });
        }

        // ═══════════════════════════════════════════════════════════════════
        // FLOW AKSESORIS
        // ═══════════════════════════════════════════════════════════════════
        if (tipe === "AKSESORIS") {
            // Ambil nama kategori (aksesoris simpen nama, bukan ID)
            let categoryName = "";
            if (category_id) {
                const { data: cat } = await supabaseAdmin
                    .from("categories")
                    .select("name")
                    .eq("id", category_id)
                    .maybeSingle();
                categoryName = cat?.name ?? "";
            }

            if (!categoryName) {
                return NextResponse.json(
                    { success: false, message: "Kategori aksesoris wajib dipilih" },
                    { status: 400 }
                );
            }

            // 1. Cek duplikat SN GLOBAL
            const snUpper = serial_number.trim().toUpperCase();
            const { count: snExists } = await supabaseAdmin
                .from("accessory_units")
                .select("id", { count: "exact", head: true })
                .eq("serial_number", snUpper);

            if (snExists && snExists > 0) {
                return NextResponse.json(
                    { success: false, message: `Serial number "${snUpper}" sudah digunakan` },
                    { status: 409 }
                );
            }

            // 2. Compute dedup hash parent (3 field)
            const dedupHash = computeAccessoryDedupHash({
                name: name ?? null,
                brand: brand ?? null,
                spec: spec ?? null,
            });

            // 3. Cari parent existing
            const { data: existingAccessory } = await supabaseAdmin
                .from("accessories")
                .select("*")
                .eq("dedup_hash", dedupHash)
                .limit(1)
                .maybeSingle();

            let parentAccessoryId: string;
            let wasExistingParent = false;

            if (existingAccessory) {
                parentAccessoryId = existingAccessory.id;
                wasExistingParent = true;
            } else {
                // 4. Create parent baru
                const sellPriceNum = selling_price != null && selling_price !== ""
                    ? Math.max(0, Math.round(Number(selling_price))) : 0;
                const buyPriceNum = buy_price != null && buy_price !== ""
                    ? Math.max(0, Math.round(Number(buy_price))) : 0;

                const { data: newParent, error: parentErr } = await supabaseAdmin
                    .from("accessories")
                    .insert({
                        name: name.trim(),
                        category: categoryName.trim().toUpperCase(),
                        brand: brand?.trim() || null,
                        spec: spec?.trim() || null,
                        buy_price: buyPriceNum,
                        sell_price: sellPriceNum,
                        stock: 0, // di-recalc setelah unit insert
                        notes: notes?.trim() || null,
                        dedup_hash: dedupHash,
                    })
                    .select()
                    .single();

                if (parentErr) throw parentErr;
                parentAccessoryId = newParent.id;
            }

            // 5. Insert SN
            const finalSelling = selling_price != null && selling_price !== ""
                ? Math.max(0, Math.round(Number(selling_price))) : 0;
            const finalBuy = buy_price != null && buy_price !== ""
                ? Math.max(0, Math.round(Number(buy_price))) : 0;

            const safeCondition = condition === "BARU" || condition === "BEKAS" ? condition : "BARU";

            const { data: newUnit, error: unitErr } = await supabaseAdmin
                .from("accessory_units")
                .insert({
                    accessory_id: parentAccessoryId,
                    serial_number: snUpper,
                    // Identitas per-SN
                    name: name.trim(),
                    brand: brand || null,
                    spec: spec || null,
                    // Kondisi & harga
                    condition: safeCondition,
                    status: "TERSEDIA",
                    buy_price: finalBuy,
                    selling_price: finalSelling,
                    // Per-SN lain
                    source: source?.trim() || null,
                    branch: safeBranch,
                    notes: notes?.trim() || null,
                })
                .select()
                .single();

            if (unitErr) throw unitErr;

            // 6. Recalc parent stock
            await recalcAccessoryParentStock(supabaseAdmin, parentAccessoryId);

            // 7. Log
            try {
                await logActivity({
                    userId: user.id,
                    userName: user.name,
                    userRole: user.role,
                    action: "CREATE",
                    entity: "unit",
                    entityId: newUnit.id,
                    entityLabel: `SN: ${newUnit.serial_number} (${name})${wasExistingParent ? " — masuk folder existing" : " — folder baru"}`,
                    afterData: newUnit,
                });
            } catch { /* non-blocking */ }

            return NextResponse.json({
                success: true,
                data: {
                    unit: newUnit,
                    parent_id: parentAccessoryId,
                    was_existing_parent: wasExistingParent,
                },
                message: wasExistingParent
                    ? `SN masuk ke folder existing "${name}"`
                    : `Folder "${name}" baru dibuat + SN pertama masuk`,
            });
        }

        return NextResponse.json(
            { success: false, message: "Tipe tidak dikenali" },
            { status: 400 }
        );
    } catch (err) {
        console.error("[POST /api/data-barang/units/create]", err);
        const msg = err instanceof Error ? err.message : "Internal server error";
        return NextResponse.json(
            { success: false, message: msg },
            { status: 500 }
        );
    }
}

export const POST = withAuth(postHandler);