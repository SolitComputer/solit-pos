import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_VIEW_ROLES, PREPARATION_CREATE_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props { params: Promise<{ id: string }>; }

async function getHandler(_req: NextRequest, props: Props, _user: AuthUser) {
  try {
    const { id } = await props.params;
    const { data, error } = await supabase
      .from("preparation_orders")
      .select(`*, preparation_items ( * )`)
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, message: "Data penyiapan tidak ditemukan" }, { status: 404 });
    }

    // ── Deteksi unit yang sudah SOLD lewat transaksi di pesanan LAIN ──────────
    // Business rule: SN yang sama boleh dipakai di lebih dari 1 penyiapan
    // sekaligus (lihat units/search-sn — sekarang tidak lagi cuma SIAP_JUAL).
    // Begitu salah satu penyiapan itu berhasil dibayar (unit jadi SOLD lewat
    // confirm-payment), penyiapan LAIN yang masih pegang unit_id yang sama
    // TIDAK ikut berubah statusnya sendiri — tapi tiap itemnya perlu ditandai
    // "sold_elsewhere" supaya frontend bisa kasih tahu user unit itu sudah
    // tidak bisa diproses di sini lagi.
    const unitIds = [...new Set(
      (data.preparation_items ?? [])
        .map((it: any) => it.unit_id)
        .filter(Boolean)
    )] as string[];

    if (unitIds.length > 0) {
      const { data: units } = await supabase
        .from("laptop_units")
        .select("id, status")
        .in("id", unitIds);

      const soldUnitIds = (units ?? [])
        .filter((u: any) => u.status === "SOLD")
        .map((u: any) => u.id as string);

      if (soldUnitIds.length > 0) {
        // Cari transaksi PAID yang BENAR-BENAR menjual unit-unit itu —
        // single-unit lewat kolom unit_id, multi-unit lewat kolom unit_ids.
        const [{ data: singleTx }, { data: multiTx }] = await Promise.all([
          supabase
            .from("transactions")
            .select("invoice_number, unit_id")
            .in("unit_id", soldUnitIds)
            .eq("status", "PAID"),
          supabase
            .from("transactions")
            .select("invoice_number, unit_ids")
            .overlaps("unit_ids", soldUnitIds)
            .eq("status", "PAID"),
        ]);

        const unitToInvoice = new Map<string, string>();
        (singleTx ?? []).forEach((tx: any) => {
          if (tx.unit_id) unitToInvoice.set(tx.unit_id, tx.invoice_number);
        });
        (multiTx ?? []).forEach((tx: any) => {
          (tx.unit_ids ?? []).forEach((uid: string) => {
            if (soldUnitIds.includes(uid)) unitToInvoice.set(uid, tx.invoice_number);
          });
        });

        // Peta invoice_number → pesanan yang link ke invoice itu, supaya
        // pesannya bisa sebut nomor order (mis. "PREP-20260731-0007"),
        // bukan cuma nomor invoice yang kurang familiar buat provider.
        const invoiceNumbers = [...new Set(unitToInvoice.values())];
        const invoiceToOrder = new Map<string, { id: string; order_number: string }>();
        if (invoiceNumbers.length > 0) {
          const { data: linkedOrders } = await supabase
            .from("preparation_orders")
            .select("id, order_number, transaction_invoice")
            .in("transaction_invoice", invoiceNumbers);
          (linkedOrders ?? []).forEach((o: any) => {
            invoiceToOrder.set(o.transaction_invoice, { id: o.id, order_number: o.order_number });
          });
        }

        // Tempelkan info konflik ke tiap item — TAPI hanya kalau invoice yang
        // menjual unit itu BUKAN invoice milik order ini sendiri (kalau sama,
        // berarti order ini sendiri yang lunas, bukan konflik).
        data.preparation_items = (data.preparation_items ?? []).map((it: any) => {
          if (!it.unit_id || !unitToInvoice.has(it.unit_id)) return it;
          const soldInvoice = unitToInvoice.get(it.unit_id)!;
          if (soldInvoice === data.transaction_invoice) return it;
          const soldOrder = invoiceToOrder.get(soldInvoice);
          return {
            ...it,
            sold_elsewhere: {
              invoice_number: soldInvoice,
              preparation_id: soldOrder?.id ?? null,
              preparation_order_number: soldOrder?.order_number ?? null,
            },
          };
        });
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[GET /api/preparation/[id]]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

async function patchHandler(req: NextRequest, props: Props, _user: AuthUser) {
  try {
    const { id } = await props.params;
    const { transaction_invoice } = await req.json();

    if (!transaction_invoice) {
      return NextResponse.json({ success: false, message: "transaction_invoice wajib diisi" }, { status: 400 });
    }

    const { data: order } = await supabase
      .from("preparation_orders").select("id").eq("id", id).single();
    if (!order) return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("preparation_orders")
      .update({ transaction_invoice, transaction_linked_at: now, updated_at: now })
      .eq("id", id).select().single();
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[PATCH /api/preparation/[id]]", err);
    return NextResponse.json({ success: false, message: "Gagal link transaksi" }, { status: 500 });
  }
}

async function deleteHandler(_req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const { data: order } = await supabase.from("preparation_orders").select("*").eq("id", id).single();
    if (!order) return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

    if (order.status !== "MENUNGGU") {
      return NextResponse.json({ success: false, message: `Tidak bisa dihapus, status sudah "${order.status}"` }, { status: 400 });
    }

    const { error } = await supabase.from("preparation_orders").delete().eq("id", id);
    if (error) throw error;

    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: "DELETE", entity: "preparation", entityId: id,
      entityLabel: `${order.order_number} — ${order.customer_name}`,
      beforeData: order,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/preparation/[id]]", err);
    return NextResponse.json({ success: false, message: "Gagal menghapus" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, PREPARATION_VIEW_ROLES);
export const PATCH = withAuth(patchHandler, PREPARATION_VIEW_ROLES);
export const DELETE = withAuth(deleteHandler, PREPARATION_CREATE_ROLES);