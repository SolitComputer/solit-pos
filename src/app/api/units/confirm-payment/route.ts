import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { generateInvoice } from "@/lib/invoice";

const OWNERSHIP_EXEMPT_ROLES = [
  "ADMIN",
  "PROGRAMMER",
  "ASISTEN_CEO",
  "KEPALA_SALES",
  "KEPALA_ZENITH",
  "KEPALA_SOTECH",
  "KEPALA_ONPOINT",
];

async function postHandler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const body = await req.json();
    const { invoice_number, payment_photo, serial_number, amount, is_partial, payment_method, selected_unit_ids } = body;

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

    const userRoles: string[] = user.roles ?? [user.role];
    const isOwnershipExempt = userRoles.some((r) => OWNERSHIP_EXEMPT_ROLES.includes(r));

    if (
      transaction.status !== "PACKING" &&
      !isOwnershipExempt &&
      transaction.sales_id !== user.id
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Hanya sales yang membuat transaksi ini yang bisa menyelesaikan pembayaran.",
        },
        { status: 403 }
      );
    }

    if (!["RESERVED", "HELD", "PACKING", "PENDING"].includes(transaction.status)) {
      return NextResponse.json(
        { success: false, message: `Status "${transaction.status}" tidak bisa dikonfirmasi` },
        { status: 400 }
      );
    }

    const dealTotal = Number(transaction.deal_price ?? transaction.amount ?? 0);
    const paidSoFar = Number(transaction.dp_amount ?? 0);
    const remaining = Math.max(0, dealTotal - paidSoFar);

    // ── REVISI: Foto bukti pembayaran wajib diisi setiap konfirmasi ──
    if (!payment_photo || typeof payment_photo !== "string" || !payment_photo.trim()) {
      return NextResponse.json(
        { success: false, message: "Foto bukti pembayaran wajib diupload" },
        { status: 400 }
      );
    }

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
          payment_photo: payment_photo,
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
        payment_method: payment_method || transaction.payment_method || null,
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
    // REVISI: nominal pembayaran sekarang bisa dikirim manual dari modal
    // (field "Nominal Pembayaran"). Kalau valid, itu jadi acuan finalPayment —
    // dipakai terutama untuk transaksi E-Commerce Pending yang harga deal-nya
    // Rp0 saat dibuat. Kalau tidak dikirim, fallback ke perhitungan lama.
    const requestedAmount = Number(amount);
    const finalPayment = Number.isFinite(requestedAmount) && requestedAmount > 0 ? requestedAmount : remaining;
    const newDealTotal = paidSoFar + finalPayment;
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

      // ── Pelunasan Parsial per Unit (Split Transaksi) ──────────────────────
      const isPartialUnit = Array.isArray(selected_unit_ids) &&
        selected_unit_ids.length > 0 &&
        selected_unit_ids.length < unitIds.length &&
        selected_unit_ids.every((id: string) => unitIds.includes(id));

      if (isPartialUnit) {
        // Ambil SEMUA transaction_items milik invoice ini
        const { data: allItems, error: itemsErr } = await supabaseAdmin
          .from("transaction_items")
          .select("*")
          .eq("invoice_number", invoice_number);

        if (itemsErr) {
          return NextResponse.json({ success: false, message: "Gagal mengambil data item: " + itemsErr.message }, { status: 500 });
        }

        const items = allItems ?? [];
        const paidItems = items.filter(it => it.item_type === "laptop" ? selected_unit_ids.includes(it.unit_id) : true);
        const unpaidItems = items.filter(it => it.item_type === "laptop" && !selected_unit_ids.includes(it.unit_id));

        if (unpaidItems.length === 0) {
          // Semua laptop terpilih, lanjut ke jalur biasa
        } else {
          const paidUnits = units.filter(u => selected_unit_ids.includes(u.id));
          const unpaidUnits = units.filter(u => !selected_unit_ids.includes(u.id));

          // Guard double-booking untuk unit yang mau dilunasi
          const alreadySold = paidUnits.filter((u: any) => u.status === "SOLD");
          if (alreadySold.length > 0) {
            const snList = alreadySold.map((u: any) => u.serial_number).join(", ");
            return NextResponse.json(
              { success: false, message: `Unit SN ${snList} sudah terjual lewat transaksi lain. Tidak bisa diproses lagi.` },
              { status: 409 }
            );
          }

          const paidUnitIds = paidUnits.map(u => u.id);
          const paidSNs = paidUnits.map(u => u.serial_number);
          const unpaidUnitIds = unpaidUnits.map(u => u.id);
          const unpaidSNs = unpaidUnits.map(u => u.serial_number);

          const paidDealTotal = paidItems.reduce((acc, it) => acc + (Number(it.deal_price) || 0), 0);
          const paidInventoryTotal = paidItems.reduce((acc, it) => acc + (Number(it.selling_price) || 0), 0);

          const unpaidDealTotal = unpaidItems.reduce((acc, it) => acc + (Number(it.deal_price) || 0), 0);
          const unpaidInventoryTotal = unpaidItems.reduce((acc, it) => acc + (Number(it.selling_price) || 0), 0);

          const primaryPaid = paidItems.find(it => it.unit_id) || paidItems[0];
          const primaryUnpaid = unpaidItems[0];

          const paidLaptopItemsCount = paidItems.filter(it => it.item_type === "laptop").length;
          const paidLaptopName = paidLaptopItemsCount > 1
            ? `${primaryPaid.laptop_name} (+${paidLaptopItemsCount - 1} unit)`
            : primaryPaid.laptop_name;

          const unpaidLaptopName = unpaidItems.length > 1
            ? `${primaryUnpaid.laptop_name} (+${unpaidItems.length - 1} unit)`
            : primaryUnpaid.laptop_name;

          // 1. Generate nomor invoice baru untuk sisa unit yang belum lunas
          const newPendingInvoice = await generateInvoice();

          // 2. Insert transaksi pending baru untuk unit yang belum lunas
          const { data: newPendingTx, error: newTxErr } = await supabaseAdmin
            .from("transactions")
            .insert({
              invoice_number: newPendingInvoice,
              sales_id: transaction.sales_id,
              sales_name: transaction.sales_name,
              employee_role: transaction.employee_role,
              customer_name: transaction.customer_name,
              customer_phone: transaction.customer_phone,
              company_name: transaction.company_name,
              customer_type: transaction.customer_type,
              seller_type: transaction.seller_type,
              laptop_id: primaryUnpaid.laptop_id ?? null,
              unit_id: primaryUnpaid.unit_id ?? null,
              laptop_name: unpaidLaptopName,
              serial_number: unpaidSNs.join(", "),
              unit_ids: unpaidUnitIds,
              serial_numbers: unpaidSNs,
              deal_price: unpaidDealTotal,
              amount: unpaidDealTotal,
              inventory_price: unpaidInventoryTotal,
              other: unpaidDealTotal - unpaidInventoryTotal,
              dp_amount: 0,
              payment_method: transaction.payment_method,
              status: transaction.status,
              pickup_method: transaction.pickup_method,
              pickup_date: transaction.pickup_date,
              pickup_time: transaction.pickup_time,
              pickup_location: transaction.pickup_location,
              source_platform: transaction.source_platform,
              notes: (transaction.notes ? transaction.notes + " | " : "") + `[SPLIT SISA DARI ${invoice_number}]`,
              latitude: transaction.latitude,
              longitude: transaction.longitude,
              created_at: transaction.created_at,
            })
            .select()
            .single();

          if (newTxErr || !newPendingTx) {
            console.error("[confirm-payment] gagal buat transaksi split pending:", newTxErr?.message);
            return NextResponse.json({ success: false, message: "Gagal memisahkan sisa unit: " + (newTxErr?.message ?? "Error") }, { status: 500 });
          }

          // 3. Pindahkan transaction_items sisa ke invoice baru
          const unpaidItemIds = unpaidItems.map(it => it.id);
          await supabaseAdmin
            .from("transaction_items")
            .update({
              transaction_id: newPendingTx.id,
              invoice_number: newPendingInvoice,
            })
            .in("id", unpaidItemIds);

          // 4. Update reserved_invoice pada laptop_units untuk unit yang belum lunas
          await supabaseAdmin
            .from("laptop_units")
            .update({ reserved_invoice: newPendingInvoice })
            .in("id", unpaidUnitIds);

          // 5. Update transaksi saat ini menjadi PAID dengan data unit yang dilunasi
          const actualPaidAmount = finalPayment > 0 ? finalPayment : paidDealTotal;
          const { data: updatedTx, error: updateErr } = await supabaseAdmin
            .from("transactions")
            .update({
              status: "PAID",
              deal_price: paidDealTotal,
              amount: paidDealTotal,
              dp_amount: paidDealTotal,
              inventory_price: paidInventoryTotal,
              other: paidDealTotal - paidInventoryTotal,
              unit_ids: paidUnitIds,
              serial_numbers: paidSNs,
              serial_number: paidSNs.join(", "),
              laptop_name: paidLaptopName,
              unit_id: primaryPaid.unit_id,
              laptop_id: primaryPaid.laptop_id ?? transaction.laptop_id,
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
            console.error("[confirm-payment] gagal update status PAID parsial:", updateErr.message);
            return NextResponse.json({ success: false, message: "Gagal konfirmasi pembayaran: " + updateErr.message }, { status: 500 });
          }

          // 6. Catat transaction_payments
          if (actualPaidAmount > 0) {
            const { error: payErr } = await supabaseAdmin.from("transaction_payments").insert({
              transaction_id: transaction.id,
              invoice_number,
              amount: actualPaidAmount,
              payment_type: "PELUNASAN",
              payment_method: payment_method || transaction.payment_method || null,
              created_by_name: user.name,
            });
            if (payErr) console.error("[confirm-payment] gagal catat pelunasan parsial:", payErr.message);
          }

          // 7. Update status unit yang lunas jadi SOLD
          await supabaseAdmin
            .from("laptop_units")
            .update({ status: "SOLD", reserved_by: null, reserved_invoice: null })
            .in("id", paidUnitIds);

          // 8. Sync laptop parent qty untuk unit yang lunas
          const uniquePaidLaptopIds = [...new Set(paidUnits.map(u => u.laptop_id))];
          await Promise.all(uniquePaidLaptopIds.map(async (lid) => {
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

          // 9. Buat garansi untuk unit yang lunas
          const warrantiesToInsert = paidUnits.map(u => ({
            invoice_number,
            serial_number: u.serial_number.toUpperCase(),
            customer_name: transaction.customer_name,
            customer_phone: transaction.customer_phone || null,
            laptop_name: paidLaptopName,
            laptop_id: u.laptop_id,
            unit_id: u.id,
            warranty_start: now.split("T")[0],
            warranty_end: warrantyEnd.toISOString().split("T")[0],
            warranty_duration: warrantyDuration,
            status: "ACTIVE",
            created_by: user.name,
          }));
          await supabaseAdmin.from("warranties").insert(warrantiesToInsert);

          // 10. Log aktivitas
          await logActivity({
            userId: user.id, userName: user.name, userRole: user.role,
            action: "EDIT", entity: "transaction", entityId: transaction.id,
            entityLabel: `${invoice_number} — PELUNASAN PARSIAL (${paidUnitIds.length} unit lunas, sisa ${unpaidUnitIds.length} unit di-split ke ${newPendingInvoice})`,
            beforeData: transaction, afterData: updatedTx,
          });

          return NextResponse.json({
            success: true,
            message: `Pelunasan berhasil untuk ${paidUnitIds.length} unit. Sisa ${unpaidUnitIds.length} unit dipindahkan ke invoice baru ${newPendingInvoice}`,
            invoice_number,
            split_invoice: newPendingInvoice,
          });
        }
      }

      // ── Guard double-booking: unit sudah SOLD via transaksi lain ──────────
      // Sama seperti jalur single-unit di atas — cek SEBELUM transaksi ini
      // ditandai PAID, supaya tidak ada 2 transaksi PAID untuk unit fisik
      // yang sama.
      const alreadySold = units.filter((u: any) => u.status === "SOLD");
      if (alreadySold.length > 0) {
        const snList = alreadySold.map((u: any) => u.serial_number).join(", ");
        return NextResponse.json(
          { success: false, message: `Unit SN ${snList} sudah terjual lewat transaksi lain. Tidak bisa diproses lagi.` },
          { status: 409 }
        );
      }

      const { data: updatedTx, error: updateErr } = await supabaseAdmin
        .from("transactions")
        .update({
          status: "PAID",
          deal_price: newDealTotal,
          amount: newDealTotal,
          dp_amount: newDealTotal,
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
          payment_method: payment_method || transaction.payment_method || null,
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
      // FIX: unit_id/unit_ids adalah SUMBER KEBENARAN (dipakai konsisten di
      // seluruh endpoint lain — reserve, transaction/[invoice], dst). Sebelum
      // ini, kode di sini malah cari unit lewat transaction.serial_number
      // (field teks yang bisa basi — mis. setelah Tukar SN), jadi kalau
      // unit_id & serial_number tidak sinkron, unit yang di-mark SOLD adalah
      // unit yang SALAH — unit asli (di unit_id) tidak pernah ke-update.
      const targetUnitId: string | null =
        transaction.unit_id ||
        (Array.isArray(transaction.unit_ids) && transaction.unit_ids.length > 0
          ? transaction.unit_ids[0]
          : null);

      let unit: { id: string; laptop_id: string; status: string; serial_number: string } | null = null;

      if (targetUnitId) {
        const { data } = await supabaseAdmin
          .from("laptop_units")
          .select("id, laptop_id, status, serial_number")
          .eq("id", targetUnitId)
          .maybeSingle();
        unit = data;
      }

      if (!unit) {
        const fallbackSN = transaction.serial_number || serial_number;
        if (!fallbackSN) {
          return NextResponse.json(
            { success: false, message: "Serial number wajib diisi" },
            { status: 400 }
          );
        }
        const { data } = await supabaseAdmin
          .from("laptop_units")
          .select("id, laptop_id, status, serial_number")
          .eq("serial_number", fallbackSN)
          .maybeSingle();
        unit = data;
      }

      if (!unit) {
        return NextResponse.json(
          { success: false, message: `Unit untuk transaksi ${invoice_number} tidak ditemukan` },
          { status: 404 }
        );
      }

      // ── Guard double-booking: unit sudah SOLD via transaksi lain ──────────
      // SN yang sama sekarang boleh dipakai di lebih dari 1 penyiapan
      // sekaligus (lihat units/search-sn). Kalau unit ini ternyata SUDAH
      // SOLD (transaksi lain sudah lunas duluan untuk unit fisik yang sama),
      // transaksi INI tidak boleh ikut menjual unit yang sama lagi.
      if (unit.status === "SOLD") {
        return NextResponse.json(
          { success: false, message: `Unit SN ${unit.serial_number} sudah terjual lewat transaksi lain. Tidak bisa diproses lagi.` },
          { status: 409 }
        );
      }

      const finalSN = unit.serial_number;

      // Optimistic lock — sama seperti jalur multi-unit di atas.
      const { data: updatedTx, error: updateErr } = await supabaseAdmin
        .from("transactions")
        .update({
          status: "PAID",
          serial_number: finalSN,
          unit_id: unit.id,
          deal_price: newDealTotal,
          amount: newDealTotal,
          dp_amount: newDealTotal,
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
          payment_method: payment_method || transaction.payment_method || null,
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