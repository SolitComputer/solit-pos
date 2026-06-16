import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";

async function postHandler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const body = await req.json();
    const { invoice_number, payment_photo, serial_number } = body;

    if (!invoice_number) {
      return NextResponse.json(
        { success: false, message: "invoice_number wajib diisi" },
        { status: 400 }
      );
    }

    const { data: transaction } = await supabase
      .from("transactions")
      .select("*")
      .eq("invoice_number", invoice_number)
      .single();

    if (!transaction) {
      return NextResponse.json(
        { success: false, message: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }

    if (!["RESERVED", "HELD", "PACKING"].includes(transaction.status)) {
      return NextResponse.json(
        { success: false, message: `Status "${transaction.status}" tidak bisa dikonfirmasi` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const warrantyDuration = 30;
    const warrantyEnd = new Date();
    warrantyEnd.setDate(warrantyEnd.getDate() + warrantyDuration);

    // ── Deteksi multi-unit vs single unit ────────────────────────────────────
    const isMultiUnit = Array.isArray(transaction.unit_ids) && transaction.unit_ids.length > 1;

    if (isMultiUnit) {
      // ── Multi-unit: konfirmasi semua unit sekaligus ─────────────────────
      const unitIds: string[] = transaction.unit_ids;

      const { data: units } = await supabase
        .from("laptop_units")
        .select("id, laptop_id, serial_number, status")
        .in("id", unitIds);

      if (!units || units.length !== unitIds.length) {
        return NextResponse.json(
          { success: false, message: "Beberapa unit tidak ditemukan" },
          { status: 404 }
        );
      }

      // Update transaction
      const { data: updatedTx } = await supabase
        .from("transactions")
        .update({
          status: "PAID",
          paid_at: now,
          payment_photo: payment_photo || transaction.payment_photo,
          last_edited_by: user.name,
          last_edited_at: now,
        })
        .eq("invoice_number", invoice_number)
        .select()
        .single();

      // Update semua unit → SOLD
      await supabase
        .from("laptop_units")
        .update({ status: "SOLD", reserved_by: null, reserved_invoice: null })
        .in("id", unitIds);

      // Update qty tiap laptop
      const uniqueLaptopIds = [...new Set(units.map(u => u.laptop_id))];
      await Promise.all(uniqueLaptopIds.map(async (lid) => {
        const { data: remaining } = await supabase
          .from("laptop_units")
          .select("id")
          .eq("laptop_id", lid)
          .eq("status", "SIAP_JUAL");
        const newQty = remaining?.length ?? 0;
        await supabase
          .from("laptops")
          .update({ qty: newQty, status: newQty <= 0 ? "SOLD" : "SIAP_JUAL" })
          .eq("id", lid);
      }));

      // Buat warranty untuk setiap unit
      const warrantiesToInsert = units.map(u => ({
        invoice_number,
        serial_number: u.serial_number.toUpperCase(),
        customer_name: transaction.customer_name,
        customer_phone: transaction.customer_phone || null,
        laptop_name: transaction.laptop_name,
        laptop_id: u.laptop_id,
        unit_id: u.id,
        warranty_start: now.split("T")[0],
        warranty_end: warrantyEnd.toISOString().split("T")[0],
        warranty_duration: warrantyDuration,
        status: "ACTIVE",
        created_by: user.name,
      }));

      await supabase.from("warranties").insert(warrantiesToInsert);

      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "EDIT", entity: "transaction", entityId: transaction.id,
        entityLabel: `${invoice_number} — KONFIRMASI LUNAS (${unitIds.length} unit)`,
        beforeData: transaction, afterData: updatedTx,
      });

      return NextResponse.json({
        success: true,
        message: `Pembayaran dikonfirmasi untuk ${unitIds.length} unit`,
        invoice_number,
      });

    } else {
      const finalSN = transaction.serial_number || serial_number;
      if (!finalSN) {
        return NextResponse.json(
          { success: false, message: "Serial number wajib diisi" },
          { status: 400 }
        );
      }

      const { data: unit } = await supabase
        .from("laptop_units")
        .select("id, laptop_id, status")
        .eq("serial_number", finalSN)
        .single();

      if (!unit) {
        return NextResponse.json(
          { success: false, message: `Unit SN "${finalSN}" tidak ditemukan` },
          { status: 404 }
        );
      }

      const { data: updatedTx } = await supabase
        .from("transactions")
        .update({
          status: "PAID",
          serial_number: finalSN,
          unit_id: unit.id,
          paid_at: now,
          payment_photo: payment_photo || transaction.payment_photo,
          last_edited_by: user.name,
          last_edited_at: now,
        })
        .eq("invoice_number", invoice_number)
        .select()
        .single();

      await supabase
        .from("laptop_units")
        .update({ status: "SOLD", reserved_by: null, reserved_invoice: null })
        .eq("id", unit.id);

      const { data: remainingUnits } = await supabase
        .from("laptop_units")
        .select("id")
        .eq("laptop_id", unit.laptop_id)
        .eq("status", "SIAP_JUAL");

      const newQty = remainingUnits?.length ?? 0;
      await supabase
        .from("laptops")
        .update({ qty: newQty, status: newQty <= 0 ? "SOLD" : "SIAP_JUAL" })
        .eq("id", unit.laptop_id);

      await supabase.from("warranties").insert({
        invoice_number,
        serial_number: finalSN.toUpperCase(),
        customer_name: transaction.customer_name,
        customer_phone: transaction.customer_phone || null,
        laptop_name: transaction.laptop_name,
        laptop_id: unit.laptop_id,
        unit_id: unit.id,
        warranty_start: now.split("T")[0],
        warranty_end: warrantyEnd.toISOString().split("T")[0],
        warranty_duration: warrantyDuration,
        status: "ACTIVE",
        created_by: user.name,
      });

      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "EDIT", entity: "transaction", entityId: transaction.id,
        entityLabel: `${invoice_number} — ${transaction.status === "PACKING" ? "PACKING → PAID" : "KONFIRMASI LUNAS"}`,
        beforeData: transaction, afterData: updatedTx,
      });

      return NextResponse.json({
        success: true,
        message: transaction.status === "PACKING"
          ? "Dana marketplace cair, transaksi PAID"
          : "Pembayaran dikonfirmasi",
        invoice_number,
      });
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, [
  "ADMIN",
  "PROGRAMMER",
  "ASISTEN_CEO",
  "KEPALA_SALES",
]);