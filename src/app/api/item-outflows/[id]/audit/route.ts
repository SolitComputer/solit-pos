import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { logActivity, type LogEntity } from "@/lib/activityLogger";
import { ITEM_OUTFLOW_ROLES } from "@/lib/permissions";

interface Props { params: Promise<{ id: string }> }

// "manual"    → tabel item_outflows (SERVICE / KEBUTUHAN, dari form Pengambilan Barang)
// "transaksi" → penjualan via transaksi; tabel aslinya tergantung `kind`:
//                kind=ACCESSORY → accessory_outflows
//                kind=LAPTOP    → transaction_items (1 baris = 1 unit terjual)
//
// `source` default ke "manual" kalau tidak dikirim sama sekali — supaya pemanggil
// lama (tombol Audit di tab Pengambilan Barang / OutflowsContent.tsx, yang belum
// pernah kirim query param ini) tetap jalan tanpa error 400.
function resolveTable(source: string | null, kind: string | null): string | null {
    const src = source ?? "manual";
    if (src === "manual") return "item_outflows";
    if (src === "transaksi") {
        if (kind === "ACCESSORY") return "accessory_outflows";
        if (kind === "LAPTOP") return "transaction_items";
    }
    return null;
}

async function handler(req: NextRequest, props: Props, user: AuthUser) {
    try {
        const { id } = await props.params;
        const url = new URL(req.url);
        const source = url.searchParams.get("source");
        const kind = url.searchParams.get("kind");

        const table = resolveTable(source, kind);
        if (!table) {
            return NextResponse.json(
                { success: false, message: "Parameter source/kind tidak valid" },
                { status: 400 }
            );
        }

        // item_outflows pakai anon client (RLS-nya mengizinkan), sisanya
        // (accessory_outflows, transaction_items) pakai service-role.
        const db = table === "item_outflows" ? supabase : supabaseAdmin;

        const { data: current, error: fetchErr } = await db
            .from(table)
            .select("*")
            .eq("id", id)
            .single();

        if (fetchErr || !current) {
            return NextResponse.json(
                { success: false, message: "Data tidak ditemukan" },
                { status: 404 }
            );
        }

        const willAudit = !current.is_audited;
        let reason = "";

        if (!willAudit) {
            const body = await req.json().catch(() => ({}));
            reason = String(body?.reason ?? "").trim();
            if (!reason) {
                return NextResponse.json(
                    { success: false, message: "Alasan pembatalan audit wajib diisi" },
                    { status: 400 }
                );
            }
        }

        const updatePayload = willAudit
            ? {
                is_audited: true,
                audited_by: user.name,
                audited_at: new Date().toISOString(),
                audit_cancel_reason: null,
                audit_cancelled_by: null,
                audit_cancelled_at: null,
            }
            : {
                is_audited: false,
                audit_cancel_reason: reason,
                audit_cancelled_by: user.name,
                audit_cancelled_at: new Date().toISOString(),
            };

        const { data, error } = await db
            .from(table)
            .update(updatePayload)
            .eq("id", id)
            .select()
            .single();

        if (error) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: 400 }
            );
        }

        const label =
            table === "accessory_outflows"
                ? `Aksesoris (${current.accessory_id ?? "-"}) — Penjualan${current.transaction_invoice ? ` ${current.transaction_invoice}` : ""}`
                : table === "transaction_items"
                    ? `Laptop (unit ${current.unit_id ?? current.laptop_id ?? "-"}) — Penjualan${current.invoice_number ? ` ${current.invoice_number}` : ""}`
                    : `${current.item_name ?? "-"} — ${current.outflow_type ?? "-"}`;

        const entity: LogEntity =
            table === "accessory_outflows" ? "accessory_outflow" :
                table === "transaction_items" ? "transaction" :
                    "item_outflow";

        await logActivity({
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            action: willAudit ? "AUDIT" : "UNAUDIT",
            entity,
            entityId: id,
            entityLabel: label,
            reason: willAudit ? null : reason,
            beforeData: current,
            afterData: data,
        });

        return NextResponse.json({ success: true, data });
    } catch (err) {
        console.error("[item-outflows/audit][PATCH]", err);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}

export const PATCH = withAuth(handler, ITEM_OUTFLOW_ROLES);