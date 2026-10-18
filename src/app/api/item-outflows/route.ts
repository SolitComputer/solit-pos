import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { ITEM_OUTFLOW_ROLES, expandRolesWithParents } from "@/lib/permissions";
import { checkDynamicPageAccess } from "@/lib/dynamicPermissions";
import { recalcAccessoryParentStock } from "@/lib/accessoryStock";

const VALID_TYPES = ["SERVICE", "KEBUTUHAN"] as const;
type OutflowType = (typeof VALID_TYPES)[number];


async function getHandler(req: NextRequest, _ctx: unknown, _user: AuthUser) {
        try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get("type");

        const wantsAll = !type || type === "ALL";
        const wantsItemOutflows = wantsAll || (VALID_TYPES as readonly string[]).includes(type as string);
        const wantsTransaksi = wantsAll || type === "TRANSAKSI";
        const wantsService = wantsAll || type === "SERVICE";

        // ── Bagian 1: pengambilan manual (SERVICE / KEBUTUHAN) — dari item_outflows ──
        let manualRows: any[] = [];
        if (wantsItemOutflows) {
            let query = supabase
                .from("item_outflows")
                .select("*")
                .order("created_at", { ascending: false });

            if (type && (VALID_TYPES as readonly string[]).includes(type)) {
                query = query.eq("outflow_type", type);
            }

            const { data, error } = await query;
            if (error) {
                return NextResponse.json(
                    { success: false, message: error.message },
                    { status: 400 }
                );
            }
            manualRows = data ?? [];
        }

        // ── Bagian 2: penjualan aksesoris via transaksi — dari accessory_outflows ──
        // Sumber ini sudah otomatis tercatat & disinkronkan restore-nya oleh sistem
        // transaksi (transaction/create + restore), jadi tinggal ditampilkan di sini,
        // tidak perlu ditulis ulang.
        let transaksiRows: any[] = [];
        if (wantsTransaksi) {
            const { data: accOutflows, error: accErr } = await supabaseAdmin
                .from("accessory_outflows")
               .select("id, accessory_id, qty, status, transaction_invoice, notes, created_at, is_audited, audited_by, audited_at, audit_cancel_reason, audit_cancelled_by, audit_cancelled_at")
                .eq("source_type", "transaction")
                .order("created_at", { ascending: false });

            if (accErr) {
                console.error("[item-outflows][GET] gagal ambil accessory_outflows:", accErr.message);
            } else if (accOutflows && accOutflows.length > 0) {
                const accessoryIds = [...new Set(accOutflows.map((o) => o.accessory_id).filter(Boolean))];
                const invoiceNumbers = [...new Set(accOutflows.map((o) => o.transaction_invoice).filter(Boolean))];

                const [{ data: accessories }, { data: transactions }] = await Promise.all([
                    accessoryIds.length > 0
                        ? supabaseAdmin.from("accessories").select("id, name").in("id", accessoryIds)
                        : Promise.resolve({ data: [] as any[] }),
                    invoiceNumbers.length > 0
                        ? supabaseAdmin.from("transactions").select("invoice_number, customer_name, sales_name").in("invoice_number", invoiceNumbers)
                        : Promise.resolve({ data: [] as any[] }),
                ]);

                const accessoryNameMap = new Map((accessories ?? []).map((a: any) => [a.id, a.name]));
                const txMap = new Map((transactions ?? []).map((t: any) => [t.invoice_number, t]));

                transaksiRows = accOutflows.map((o: any) => {
                    const tx = o.transaction_invoice ? txMap.get(o.transaction_invoice) : null;
                    return {
                        id: o.id,
                        outflow_type: "TRANSAKSI",
                        person_name: tx?.customer_name ?? "—",
                        item_kind: "ACCESSORY",
                        item_ref_id: o.accessory_id,
                        item_name: accessoryNameMap.get(o.accessory_id) ?? "Aksesoris",
                        purpose: o.notes ?? (o.transaction_invoice ? `Penjualan ${o.transaction_invoice}` : "Penjualan"),
                        nominal: null,
                        is_audited: Boolean(o.is_audited),
                        audited_by: o.audited_by ?? null,
                        audited_at: o.audited_at ?? null,
                        audit_cancel_reason: o.audit_cancel_reason ?? null,
                        audit_cancelled_by: o.audit_cancelled_by ?? null,
                        audit_cancelled_at: o.audit_cancelled_at ?? null,
                        created_by_name: tx?.sales_name ?? null,
                        created_by_role: null,
                        created_at: o.created_at,
                        status: o.status,
                        transaction_invoice: o.transaction_invoice,
                    };
                });
            }
        }

        // ── Bagian 3: penjualan LAPTOP via transaksi — dari transaction_items ──
        // Satu baris transaction_items (item_type != accessory, punya unit_id/laptop_id)
        // = satu unit laptop yang keluar. Audit disimpan per-unit di sini.
        let transaksiLaptopRows: any[] = [];
        if (wantsTransaksi) {
            const { data: laptopItems, error: liErr } = await supabaseAdmin
                .from("transaction_items")
                .select("id, invoice_number, unit_id, laptop_id, item_type, accessory_id, created_at, is_audited, audited_by, audited_at, audit_cancel_reason, audit_cancelled_by, audit_cancelled_at")
                .order("created_at", { ascending: false });

            if (liErr) {
                console.error("[item-outflows][GET] gagal ambil transaction_items (laptop):", liErr.message);
            } else if (laptopItems && laptopItems.length > 0) {
                // Sama seperti logic di /api/transaction: baris dianggap "laptop" kalau
                // bukan accessory dan punya unit_id/laptop_id.
                const filtered = laptopItems.filter((it: any) => {
                    const isAccessory = it.item_type === "accessory" || (Boolean(it.accessory_id) && !it.unit_id);
                    return !isAccessory && (it.unit_id || it.laptop_id);
                });

                if (filtered.length > 0) {
                    const invoiceNumbers = [...new Set(filtered.map((it: any) => it.invoice_number).filter(Boolean))];
                    const unitIds = [...new Set(filtered.map((it: any) => it.unit_id).filter(Boolean))];

                    const [{ data: transactions }, { data: units }] = await Promise.all([
                        invoiceNumbers.length > 0
                            ? supabaseAdmin.from("transactions").select("invoice_number, customer_name, sales_name, status").in("invoice_number", invoiceNumbers)
                            : Promise.resolve({ data: [] as any[] }),
                        unitIds.length > 0
                            ? supabaseAdmin.from("laptop_units").select("id, laptop_id, serial_number").in("id", unitIds)
                            : Promise.resolve({ data: [] as any[] }),
                    ]);

                    const txMap = new Map((transactions ?? []).map((t: any) => [t.invoice_number, t]));
                    const unitMap = new Map((units ?? []).map((u: any) => [u.id, u]));

                    const allLaptopIds = [
                        ...new Set([
                            ...filtered.map((it: any) => it.laptop_id).filter(Boolean),
                            ...(units ?? []).map((u: any) => u.laptop_id).filter(Boolean),
                        ]),
                    ];
                    const { data: laptops } = allLaptopIds.length > 0
                        ? await supabaseAdmin.from("laptops").select("id, laptop_name").in("id", allLaptopIds)
                        : { data: [] as any[] };
                    const laptopNameMap = new Map((laptops ?? []).map((l: any) => [l.id, l.laptop_name]));

                    transaksiLaptopRows = filtered.map((it: any) => {
                        const tx = it.invoice_number ? txMap.get(it.invoice_number) : null;
                        const unit = it.unit_id ? unitMap.get(it.unit_id) : null;
                        const laptopId = it.laptop_id ?? unit?.laptop_id ?? null;

                        return {
                            id: it.id,
                            outflow_type: "TRANSAKSI",
                            person_name: tx?.customer_name ?? "—",
                            item_kind: "LAPTOP",
                            item_ref_id: it.unit_id ?? it.laptop_id ?? null,
                            item_name: (laptopId ? laptopNameMap.get(laptopId) : null) ?? "Laptop",
                            purpose: it.invoice_number ? `Penjualan ${it.invoice_number}` : "Penjualan",
                            nominal: null,
                            is_audited: Boolean(it.is_audited),
                            audited_by: it.audited_by ?? null,
                            audited_at: it.audited_at ?? null,
                            audit_cancel_reason: it.audit_cancel_reason ?? null,
                            audit_cancelled_by: it.audit_cancelled_by ?? null,
                            audit_cancelled_at: it.audit_cancelled_at ?? null,
                            created_by_name: tx?.sales_name ?? null,
                            created_by_role: null,
                            created_at: it.created_at,
                            status: tx?.status === "CANCELLED" ? "cancelled" : "active",
                            transaction_invoice: it.invoice_number,
                            serial_number: unit?.serial_number ?? null,
                        };
                    });
                }
            }
        }

        // ── Bagian 4: sparepart SERVICE (dari accessory_outflows source=service) ──
        let serviceRows: any[] = [];
        if (wantsService) {
            const { data: svcOutflows, error: svcErr } = await supabaseAdmin
                .from("accessory_outflows")
                .select("id, accessory_id, unit_id, qty, status, service_id, notes, created_at, is_audited, audited_by, audited_at")
                .eq("source_type", "service")
                .eq("status", "active")
                .order("created_at", { ascending: false });

            if (svcErr) {
                console.error("[item-outflows][GET] gagal ambil accessory_outflows (service):", svcErr.message);
            } else if (svcOutflows && svcOutflows.length > 0) {
                const accIds = [...new Set(svcOutflows.map((o) => o.accessory_id).filter(Boolean))];
                const unitIds = [...new Set(svcOutflows.map((o) => o.unit_id).filter(Boolean))];
                const serviceIds = [...new Set(svcOutflows.map((o) => o.service_id).filter(Boolean))];

                const [{ data: accs }, { data: unitRows }, { data: svcs }] = await Promise.all([
                    accIds.length ? supabaseAdmin.from("accessories").select("id, name").in("id", accIds) : Promise.resolve({ data: [] as any[] }),
                    unitIds.length ? supabaseAdmin.from("accessory_units").select("id, serial_number").in("id", unitIds) : Promise.resolve({ data: [] as any[] }),
                    serviceIds.length ? supabaseAdmin.from("service_orders").select("id, nama").in("id", serviceIds) : Promise.resolve({ data: [] as any[] }),
                ]);
                const accNameMap = new Map((accs ?? []).map((a: any) => [a.id, a.name]));
                const unitSnMap = new Map((unitRows ?? []).map((u: any) => [u.id, u.serial_number]));
                const svcNameMap = new Map((svcs ?? []).map((s: any) => [s.id, s.nama]));

                serviceRows = svcOutflows.map((o: any) => ({
                    id: o.id,
                    outflow_type: "SERVICE",
                    person_name: svcNameMap.get(o.service_id) ?? "—",
                    item_kind: "ACCESSORY",
                    item_ref_id: o.accessory_id,
                    item_name: accNameMap.get(o.accessory_id) ?? "Aksesoris",
                    purpose: o.notes ?? "Sparepart service",
                    nominal: null,
                    is_audited: Boolean(o.is_audited),
                    audited_by: o.audited_by ?? null,
                    audited_at: o.audited_at ?? null,
                    is_restored: false,
                    restored_by: null,
                    restored_at: null,
                    created_by_name: null,
                    created_by_role: null,
                    created_at: o.created_at,
                    status: o.status,
                    serial_number: unitSnMap.get(o.unit_id) ?? null,
                    read_only: true, // dikelola dari halaman Servis → tidak diaudit/restore dari sini
                }));
            }
        }

        const combined = [...manualRows, ...transaksiRows, ...transaksiLaptopRows, ...serviceRows].sort(
                        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        return NextResponse.json({ success: true, data: combined });
    } catch (err) {
        console.error("[item-outflows][GET]", err);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}

// ── POST — Kebutuhan: aksesoris keluar → modal pindah ke laptop tujuan ──────
async function postHandler(req: NextRequest, _ctx: unknown, user: AuthUser) {
    try {
        const effectiveRoles = expandRolesWithParents(user.roles ?? [user.role]);
        const hasStaticAccess = effectiveRoles.some(r => (ITEM_OUTFLOW_ROLES as string[]).includes(r));
        if (!hasStaticAccess) {
            const dyn = await checkDynamicPageAccess(effectiveRoles, "/dashboard/data-barang", "create");
            if (!dyn.allowed) {
                return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
            }
        }

        const body = await req.json();
        const accessory_id = body.accessory_id || null;
        const accessory_unit_id = body.accessory_unit_id || null;
        const accessory_name = String(body.accessory_name ?? "").trim();
        const accessory_sn = body.accessory_sn ? String(body.accessory_sn).trim() : null;
        const laptop_id = body.laptop_id || null;
        const laptop_unit_id = body.laptop_unit_id || null;
        const laptop_name = String(body.laptop_name ?? "").trim();
        const laptop_sn = body.laptop_sn ? String(body.laptop_sn).trim() : null;

        if (!accessory_unit_id || !accessory_id) {
            return NextResponse.json({ success: false, message: "Unit aksesoris (SN) wajib dipilih" }, { status: 400 });
        }
        if (!laptop_unit_id || !laptop_id) {
            return NextResponse.json({ success: false, message: "Unit laptop tujuan (SN) wajib dipilih" }, { status: 400 });
        }

        // ── Validasi unit aksesoris + ambil modal (buy_price per-SN, fallback induk) ──
        const { data: accUnit } = await supabaseAdmin
            .from("accessory_units")
            .select("id, status, buy_price")
            .eq("id", accessory_unit_id)
            .single();
        if (!accUnit || accUnit.status !== "TERSEDIA") {
            return NextResponse.json({ success: false, message: "Unit aksesoris sudah tidak tersedia" }, { status: 400 });
        }
        let modal = Math.round(Number(accUnit.buy_price ?? 0));
        if (modal <= 0) {
            const { data: accParent } = await supabaseAdmin.from("accessories").select("buy_price").eq("id", accessory_id).single();
            modal = Math.round(Number(accParent?.buy_price ?? 0));
        }

        // ── Validasi unit laptop tujuan (harus aktif) ──
        const { data: lapUnit } = await supabaseAdmin
            .from("laptop_units")
            .select("id, status, purchase_price")
            .eq("id", laptop_unit_id)
            .single();
        if (!lapUnit || lapUnit.status === "SOLD" || lapUnit.status === "KELUAR") {
            return NextResponse.json({ success: false, message: "Unit laptop tujuan tidak valid / sudah keluar" }, { status: 400 });
        }

        const purpose = `${accessory_name || "Aksesoris"} - ${accessory_sn ?? "—"} · Pindah ke ${laptop_name || "Laptop"} - ${laptop_sn ?? "—"}`;

        // ── Catat pengambilan (item_outflows) ──
        const { data, error } = await supabase
            .from("item_outflows")
            .insert({
                outflow_type: "KEBUTUHAN",
                person_name: user.name,
                item_kind: "ACCESSORY",
                item_ref_id: accessory_id,
                item_name: accessory_name || "Aksesoris",
                unit_id: accessory_unit_id,
                serial_number: accessory_sn,
                purpose,
                nominal: modal,
                dest_unit_id: laptop_unit_id,
                dest_serial_number: laptop_sn,
                dest_item_name: laptop_name || "Laptop",
                dest_laptop_id: laptop_id,
                created_by: user.id,
                created_by_name: user.name,
                created_by_role: user.role,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 400 });
        }

        // ── Aksesoris KELUAR + hitung ulang stok induk ──
        await supabaseAdmin
            .from("accessory_units")
            .update({ status: "KELUAR" })
            .eq("id", accessory_unit_id)
            .eq("status", "TERSEDIA");
        await recalcAccessoryParentStock(supabaseAdmin, accessory_id);

        // ── Modal aksesoris PINDAH ke modal laptop tujuan (purchase_price += modal) ──
        const newPurchase = Math.round(Number(lapUnit.purchase_price ?? 0)) + modal;
        await supabaseAdmin
            .from("laptop_units")
            .update({ purchase_price: newPurchase })
            .eq("id", laptop_unit_id);

        // Jurnal TIDAK dibuat instan di sini — entry Kebutuhan ini muncul sebagai
        // draft PENDING di Jurnal Umum (buildItemOutflowKebutuhanDrafts), baru
        // masuk jurnal umum setelah dikonfirmasi.

        await logActivity({
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            action: "CREATE",
            entity: "item_outflow",
            entityId: data.id,
            entityLabel: purpose,
            afterData: data,
        });

        return NextResponse.json({ success: true, data });
    } catch (err) {
        console.error("[item-outflows][POST]", err);
        return NextResponse.json({ success: false, message: "Terjadi kesalahan server" }, { status: 500 });
    }
}

export const GET = withAuth(getHandler, ITEM_OUTFLOW_ROLES);
export const POST = withAuth(postHandler);