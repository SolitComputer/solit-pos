// src/app/api/laptops/qc/scan-flag-incomplete/route.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// FITUR 2 — Scan Data Lama & Flag Unit Kurang Field QC
//
// Pakai aturan 10 field wajib BARU (per 2026-11-19):
//   - Parent: laptop_name, brand, cpu, ram, storage
//   - Unit:   serial_number, grade, source, purchase_price, selling_price
//
// Yang di-SKIP (nggak di-scan):
//   - SOLD/TERJUAL/KELUAR/RETURNED (sudah pergi permanen)
//   - RESERVED/HELD/PACKING/PENDING (transaksi berjalan)
//
// GET  → dry-run: return count summary + preview (max 50 unit)
// POST → execute: UPDATE qc_status=NEEDS_QC + status=BELUM_SIAP
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { UserRole } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

// Role yang boleh trigger scan — selaras dgn akses halaman Team QC
const ALLOWED_ROLES: UserRole[] = [
    "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
    "KEPALA_ADMIN_BARANG", "ADMIN_BARANG",
];

// Status "sudah pergi dari stok aktif" — JANGAN di-scan.
// Konsisten dgn OUT_STATUSES di UnifiedBarangContent.
const OUT_STATUSES = [
    "SOLD", "TERJUAL", "KELUAR", "RETURNED",
    "RESERVED", "HELD", "PACKING", "PENDING",
];

type UnitRow = {
    id: string;
    serial_number: string | null;
    grade: string | null;
    source: string | null;
    purchase_price: number | null;
    selling_price: number | null;
    qc_status: string | null;
    status: string;
    created_at: string;
    laptop: { laptop_name: string | null; brand: string | null; cpu: string | null; ram: string | null; storage: string | null; } | { laptop_name: string | null; brand: string | null; cpu: string | null; ram: string | null; storage: string | null; }[] | null;
    missing_fields?: string[];
};

// Helper: cek field TEXT kosong
const isEmptyText = (v: string | null | undefined) => !v || !v.trim();

// Helper: cek field NUMBER kosong (NULL = kosong, 0 = terisi)
const isEmptyNumber = (v: number | null | undefined) => v === null || v === undefined;

// Helper: hitung missing fields per unit (pakai aturan 10 field BARU)
function computeMissing(u: UnitRow): string[] {
    const laptop = Array.isArray(u.laptop) ? u.laptop[0] : u.laptop;
    const missing: string[] = [];
    if (isEmptyText(laptop?.laptop_name)) missing.push("Nama Laptop");
    if (isEmptyText(laptop?.brand)) missing.push("Brand");
    if (isEmptyText(laptop?.cpu)) missing.push("CPU");
    if (isEmptyText(laptop?.ram)) missing.push("RAM");
    if (isEmptyText(laptop?.storage)) missing.push("Storage");
    if (isEmptyText(u.serial_number)) missing.push("SN");
    if (isEmptyText(u.grade)) missing.push("Grade");
    if (isEmptyText(u.source)) missing.push("Sumber");
    if (isEmptyNumber(u.purchase_price)) missing.push("Harga Modal");
    if (isEmptyNumber(u.selling_price)) missing.push("Harga Setor");
    return missing;
}

// ─── GET: Dry-run — preview count + sample list ──────────────────────────
async function getHandler(_req: NextRequest, _ctx: unknown, _user: AuthUser) {
    try {
        const { data: units, error } = await supabaseAdmin
            .from("laptop_units")
            .select(`
                id, serial_number, grade, source, purchase_price, selling_price,
                qc_status, status, created_at,
                laptop:laptops(laptop_name, brand, cpu, ram, storage)
            `)
            .not("status", "in", `(${OUT_STATUSES.join(",")})`)
            .order("created_at", { ascending: false });

        if (error) throw error;

        // Filter unit yg field wajibnya kosong
        const incomplete = (units as UnitRow[] ?? [])
            .map((u) => ({ ...u, missing_fields: computeMissing(u) }))
            .filter((u) => (u.missing_fields?.length ?? 0) > 0);

        const total = incomplete.length;
        const alreadyNeedsQc = incomplete.filter((u) => u.qc_status === "NEEDS_QC").length;
        const willDropFromSiapJual = incomplete.filter((u) => u.status === "SIAP_JUAL").length;

        // Preview sample (max 50 unit paling baru)
        const preview = incomplete.slice(0, 50).map((u) => {
            const laptop = Array.isArray(u.laptop) ? u.laptop[0] : u.laptop;
            return {
                id: u.id,
                serial_number: u.serial_number,
                laptop_name: laptop?.laptop_name ?? null,
                qc_status: u.qc_status,
                status: u.status,
                missing_fields: u.missing_fields ?? [],
            };
        });

        return NextResponse.json({
            success: true,
            data: { total, already_needs_qc: alreadyNeedsQc, will_drop_from_siap_jual: willDropFromSiapJual, preview },
        });
    } catch (err) {
        console.error("[GET /api/laptops/qc/scan-flag-incomplete]", err);
        return NextResponse.json(
            { success: false, message: err instanceof Error ? err.message : "Internal error" },
            { status: 500 }
        );
    }
}

// ─── POST: Execute flag NEEDS_QC + BELUM_SIAP ─────────────────────────────
async function postHandler(_req: NextRequest, _ctx: unknown, user: AuthUser) {
    try {
        const { data: units, error: fetchErr } = await supabaseAdmin
            .from("laptop_units")
            .select(`
                id, serial_number, grade, source, purchase_price, selling_price,
                qc_status, status, created_at,
                laptop:laptops(laptop_name, brand, cpu, ram, storage)
            `)
            .not("status", "in", `(${OUT_STATUSES.join(",")})`);

        if (fetchErr) throw fetchErr;

        const targetIds = (units as UnitRow[] ?? [])
            .filter((u) => computeMissing(u).length > 0)
            .map((u) => u.id);

        if (targetIds.length === 0) {
            return NextResponse.json({
                success: true,
                data: { affected: 0 },
                message: "Tidak ada unit yang perlu di-flag — semua sudah lengkap.",
            });
        }

        // Batch UPDATE
        const { error: updateErr } = await supabaseAdmin
            .from("laptop_units")
            .update({ qc_status: "NEEDS_QC", status: "BELUM_SIAP" })
            .in("id", targetIds);

        if (updateErr) throw updateErr;

        // Log activity (non-blocking)
        try {
            await logActivity({
                userId: user.id,
                userName: user.name,
                userRole: user.role,
                action: "SCAN_QC_INCOMPLETE" as any,
                entity: "unit",
                entityId: "batch",
                entityLabel: `Scan Data Lama — ${targetIds.length} unit di-flag NEEDS_QC + BELUM_SIAP`,
            });
        } catch { /* non-blocking */ }

        return NextResponse.json({
            success: true,
            data: { affected: targetIds.length },
            message: `${targetIds.length} unit di-flag ke antrian Team QC.`,
        });
    } catch (err) {
        console.error("[POST /api/laptops/qc/scan-flag-incomplete]", err);
        return NextResponse.json(
            { success: false, message: err instanceof Error ? err.message : "Internal error" },
            { status: 500 }
        );
    }
}

export const GET = withAuth(getHandler, ALLOWED_ROLES);
export const POST = withAuth(postHandler, ALLOWED_ROLES);