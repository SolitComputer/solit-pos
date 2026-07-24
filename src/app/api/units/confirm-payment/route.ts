import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";

async function postHandler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const body = await req.json();
    const { invoice_number, payment_photo, serial_number, amount, is_partial } = body;

    if (!invoice_number) {
      return NextResponse.json(
        { success: false, message: "invoice_number wajib diisi" },
        { status: 400 }
      );
    }

    const { data: transaction } = await supabaseAdmin
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

    // ── Gate kepemilikan: hanya sales yang MEMBUAT transaksi ini yang boleh FU/Lunas ──
    if (transaction.sales_id !== user.id) {
      return NextResponse.json(
        {
          success: false,
          message: "Hanya sales yang membuat transaksi ini yang bisa menyelesaikan pembayaran.",
        },
        { status: 403 }
      );
    }

    // ── Gate kepemilikan: hanya sales yang MEMBUAT transaksi ini yang boleh FU ──
    if (transaction.sales_id !== user.id) {
      return NextResponse.json(
        {
          success: false,
          message: "Hanya sales yang membuat transaksi ini yang bisa menyelesaikan (FU).",
        },
        { status: 403 }
      );
    }

    if (!["RESERVED", "HELD", "PACKING"].includes(transaction.status)) {
      return NextResponse.json(
        { success: false, message: `Status "${transaction.status}" tidak bisa dikonfirmasi` },
        { status: 400 }
      );
    }

    const dealTotal = Number(transaction.deal_price ?? transaction.amount ?? 0);
    const paidSoFar = Number(transaction.dp_amount ?? 0);
    const remaining = Math.max(0, dealTotal - paidSoFar);

    // ── Jalur CICILAN: bayar sebagian, transaksi TETAP di status semula ──
    if (is_partial) {
      const cicilan = Math.round(Number(amount));
      if (!Number.isFinite(cicilan) || cicilan <= 0) {
        return NextResponse.json({ success: false, message: "Nominal cicilan tidak valid" }, { status: 400 });
      }
      if (cicilan >= remaining) {
        return NextResponse.json(
          {
            success: false,
            message: `Nominal cicilan (Rp${cicilan.toLocaleString("id-ID")}) melebihi atau sama dengan sisa tagihan (Rp${remaining.toLocaleString("id-ID")}). Gunakan opsi "Lunas Sekarang".`,
          },
          { status: 400 }
        );
      }

      const newPaidTotal = paidSoFar + cicilan;
      const now = new Date().toISOString();

      const { data: updatedTx, error: updateErr } = await supabaseAdmin
        .from("transactions")
        .update({
          dp_amount: newPaidTotal,
          last_edited_by: user.name,
          last_edited_at: now,
          notes: transaction.notes
            ? `${transaction.notes} | [CICILAN ${now.split("T")[0]}: Rp${cicilan.toLocaleString("id-ID")} oleh ${user.name}]`
            : `[CICILAN ${now.split("T")[0]}: Rp${cicilan.toLocaleString("id-ID")} oleh ${user.name}]`,
        })
        .eq("invoice_number", invoice_number)
        .eq("dp_amount", paidSoFar)
        .select()
        .maybeSingle();

      if (updateErr) {
        console.error("[confirm-payment] gagal update dp_amount cicilan:", updateErr.message);
        return NextResponse.json({ success: false, message: "Gagal menyimpan cicilan: " + updateErr.message }, { status: 500 });
      }
      if (!updatedTx) {
        return NextResponse.json(
          { success: false, message: "Data transaksi sudah berubah (mungkin diproses bersamaan). Silakan refresh dan coba lagi." },
          { status: 409 }
        );
      }

      const { error: payErr } = await supabaseAdmin.from("transaction_payments").insert({
        transaction_id: transaction.id,
        invoice_number,
        amount: cicilan,
        payment_type: "CICILAN",
        created_by_name: user.name,
      });
      if (payErr) {
        console.error("[confirm-payment] gagal catat cicilan:", payErr.message);
        return NextResponse.json({ success: false, message: "Gagal mencatat cicilan: " + payErr.message }, { status: 500 });
      }

      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "EDIT", entity: "transaction", entityId: transaction.id,
        entityLabel: `${invoice_number} — CICILAN Rp${cicilan.toLocaleString("id-ID")} (sisa Rp${(dealTotal - newPaidTotal).toLocaleString("id-ID")})`,
        beforeData: transaction, afterData: updatedTx,
      });

      return NextResponse.json({
        success: true,
        message: `Cicilan Rp${cicilan.toLocaleString("id-ID")} tercatat. Sisa tagihan: Rp${(dealTotal - newPaidTotal).toLocaleString("id-ID")}`,
        invoice_number,
        paid_amount: newPaidTotal,
        remaining: dealTotal - newPaidTotal,
      });
    }

    // ── Jalur LUNAS (melunasi sisa, sekaligus proses SOLD & warranty) ────
    const finalPayment = remaining;
    const now = new Date().toISOString();
    const warrantyDuration = 30;
    const warrantyEnd = new Date();
    warrantyEnd.setDate(warrantyEnd.getDate() + warrantyDuration);

    const isMultiUnit = Array.isArray(transaction.unit_ids) && transaction.unit_ids.length > 1;

    if (isMultiUnit) {
      const unitIds: string[] = transaction.unit_ids;

      const { data: units } = await supabaseAdmin
        .from("laptop_units")
        .select("id, laptop_id, serial_number, status")
        .in("id", unitIds);

      if (!units || units.length !== unitIds.length) {
        return NextResponse.json(
          { success: false, message: "Beberapa unit tidak ditemukan" },
          { status: 404 }
        );
      }

      const { data: updatedTx, error: updateErr } = await supabaseAdmin
        .from("transactions")
        .update({
          status: "PAID",
          dp_amount: dealTotal,
          paid_at: now,
          payment_photo: payment_photo || transaction.payment_photo,
          last_edited_by: user.name,
          last_edited_at: now,
        })
        .eq("invoice_number", invoice_number)
        .eq("status", transaction.status)
        .select()
        .maybeSingle();

      if (updateErr) {
        console.error("[confirm-payment] gagal update status PAID (multi-unit):", updateErr.message);
        return NextResponse.json({ success: false, message: "Gagal konfirmasi pembayaran: " + updateErr.message }, { status: 500 });
      }
      if (!updatedTx) {
        return NextResponse.json(
          { success: false, message: "Transaksi ini sudah diproses (mungkin bersamaan dengan permintaan lain). Silakan refresh." },
          { status: 409 }
        );
      }

      if (finalPayment > 0) {
        const { error: payErr } = await supabaseAdmin.from("transaction_payments").insert({
          transaction_id: transaction.id,
          invoice_number,
          amount: finalPayment,
          payment_type: "PELUNASAN",
          created_by_name: user.name,
        });
        if (payErr) console.error("[confirm-payment] gagal catat pelunasan (multi-unit):", payErr.message);
      }

      await supabaseAdmin
        .from("laptop_units")
        .update({ status: "SOLD", reserved_by: null, reserved_invoice: null })
        .in("id", unitIds);

      const uniqueLaptopIds = [...new Set(units.map(u => u.laptop_id))];
      await Promise.all(uniqueLaptopIds.map(async (lid) => {
        const { data: remainingUnits } = await supabaseAdmin
          .from("laptop_units")
          .select("id")
          .eq("laptop_id", lid)
          .eq("status", "SIAP_JUAL");
        const newQty = remainingUnits?.length ?? 0;
        await supabaseAdmin
          .from("laptops")
          .update({ qty: newQty, status: newQty <= 0 ? "SOLD" : "SIAP_JUAL" })
          .eq("id", lid);
      }));

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

      await supabaseAdmin.from("warranties").insert(warrantiesToInsert);

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

      const { data: unit } = await supabaseAdmin
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

      // Optimistic lock — sama seperti jalur multi-unit di atas.
      const { data: updatedTx, error: updateErr } = await supabaseAdmin
        .from("transactions")
        .update({
          status: "PAID",
          serial_number: finalSN,
          unit_id: unit.id,
          dp_amount: dealTotal,
          paid_at: now,
          payment_photo: payment_photo || transaction.payment_photo,
          last_edited_by: user.name,
          last_edited_at: now,
        })
        .eq("invoice_number", invoice_number)
        .eq("status", transaction.status)
        .select()
        .maybeSingle();

      if (updateErr) {
        console.error("[confirm-payment] gagal update status PAID:", updateErr.message);
        return NextResponse.json({ success: false, message: "Gagal konfirmasi pembayaran: " + updateErr.message }, { status: 500 });
      }
      if (!updatedTx) {
        return NextResponse.json(
          { success: false, message: "Transaksi ini sudah diproses (mungkin bersamaan dengan permintaan lain). Silakan refresh." },
          { status: 409 }
        );
      }

      if (finalPayment > 0) {
        const { error: payErr } = await supabaseAdmin.from("transaction_payments").insert({
          transaction_id: transaction.id,
          invoice_number,
          amount: finalPayment,
          payment_type: "PELUNASAN",
          created_by_name: user.name,
        });
        if (payErr) console.error("[confirm-payment] gagal catat pelunasan:", payErr.message);
      }

      await supabaseAdmin
        .from("laptop_units")
        .update({ status: "SOLD", reserved_by: null, reserved_invoice: null })
        .eq("id", unit.id);

      const { data: remainingUnits } = await supabaseAdmin
        .from("laptop_units")
        .select("id")
        .eq("laptop_id", unit.laptop_id)
        .eq("status", "SIAP_JUAL");

      const newQty = remainingUnits?.length ?? 0;
      await supabaseAdmin
        .from("laptops")
        .update({ qty: newQty, status: newQty <= 0 ? "SOLD" : "SIAP_JUAL" })
        .eq("id", unit.laptop_id);

      await supabaseAdmin.from("warranties").insert({
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
  "KEPALA_ZENITH",
  "CREW_SALES",
  "KEPALA_SOTECH",
  "KEPALA_ONPOINT",
  "ONPOINT",
]);