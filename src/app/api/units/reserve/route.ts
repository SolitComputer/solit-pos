// src/app/api/units/reserve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { generateInvoice } from "@/lib/invoice";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const body = await req.json();
    const {
      unit_id, type,
      customer_name, customer_phone, company_name,
      dp_amount, deal_price,
      payment_method, source_platform,
      notes, sales_name,
      software_request, pickup_method,
      pickup_date, pickup_time, pickup_location,
    } = body;

    if (!unit_id) return NextResponse.json({ success: false, message: "unit_id wajib" }, { status: 400 });
    if (!type) return NextResponse.json({ success: false, message: "type wajib (RESERVED/HELD)" }, { status: 400 });
    if (!customer_name) return NextResponse.json({ success: false, message: "customer_name wajib" }, { status: 400 });
    if (!deal_price) return NextResponse.json({ success: false, message: "deal_price wajib" }, { status: 400 });
    if (type === "RESERVED" && !dp_amount) {
      return NextResponse.json({ success: false, message: "dp_amount wajib untuk DP" }, { status: 400 });
    }

    // ── 1. Fetch unit ─────────────────────────────────────────────────────
    const { data: unit, error: unitErr } = await supabaseAdmin
      .from("laptop_units")
      .select(`*, laptop:laptops(id, laptop_name, brand, cpu, ram, storage, selling_price, purchase_price)`)
      .eq("id", unit_id)
      .single();

    if (unitErr || !unit) {
      return NextResponse.json({ success: false, message: "Unit tidak ditemukan" }, { status: 404 });
    }

    if (unit.status !== "SIAP_JUAL") {
      return NextResponse.json(
        { success: false, message: `Unit tidak tersedia (status: ${unit.status})` },
        { status: 409 }
      );
    }

    // ── 2. Generate invoice ────────────────────────────────────────────────
    const invoice_number = await generateInvoice();
    const txStatus = type; // "RESERVED" atau "HELD"

    // ── 3. Lock unit DULU, dengan guard status=SIAP_JUAL (optimistic lock) ─
    // Kenapa unit di-lock lebih dulu daripada insert transaksi:
    // kalau proses ini gagal di tengah, worst-case cuma unit "nyangkut" tanpa
    // transaksi (mudah dideteksi & di-fix manual). Urutan sebaliknya
    // (transaksi dulu) berisiko oversell kalau rollback-nya gagal — unit
    // kelihatan available padahal sudah ada transaksi jalan (bug yang kemarin
    // kejadian di PC Acer).
    const { data: lockedUnits, error: lockErr } = await supabaseAdmin
      .from("laptop_units")
      .update({
        status: txStatus,
        reserved_by: customer_name,
        reserved_invoice: invoice_number,
      })
      .eq("id", unit_id)
      .eq("status", "SIAP_JUAL") // guard: hanya berhasil kalau masih SIAP_JUAL saat update jalan
      .select();

    if (lockErr) {
      console.error("[reserve] gagal lock unit:", lockErr.message);
      return NextResponse.json(
        { success: false, message: "Gagal mengunci unit: " + lockErr.message },
        { status: 500 }
      );
    }

    if (!lockedUnits || lockedUnits.length === 0) {
      // Status sudah berubah duluan (race condition — user lain lebih cepat)
      return NextResponse.json(
        { success: false, message: "Unit baru saja diambil pengguna lain, silakan refresh" },
        { status: 409 }
      );
    }

    // ── 4. Hitung gross profit (untuk referensi, bukan final) ──────────────
    const inventory_price = Number(unit.purchase_price) || 0;
    const gross_profit = Number(deal_price) - inventory_price;

    // ── 5. Insert transaction dengan status RESERVED / HELD ───────────────
    const { data: tx, error: txErr } = await supabaseAdmin
      .from("transactions")
      .insert({
        invoice_number,
        sales_id: user.id,
        sales_name: sales_name || user.name,
        employee_role: user.role,

        customer_name,
        customer_phone: customer_phone || null,
        company_name: company_name || null,
        customer_type: "UMUM",

        laptop_id: unit.laptop?.id || null,
        unit_id: unit.id,
        laptop_name: unit.laptop?.laptop_name || "—",
        serial_number: unit.serial_number || null,
        unit_ids: [unit.id],
        serial_numbers: unit.serial_number ? [unit.serial_number] : [],

        deal_price: Number(deal_price),
        amount: Number(deal_price),
        dp_amount: type === "RESERVED" ? Number(dp_amount) : 0,
        inventory_price,
        other: gross_profit,

        payment_method: payment_method || "TRANSFER",
        source_platform: source_platform || null,

        software_request: software_request || null,
        pickup_method: pickup_method || null,
        pickup_date: pickup_date || null,
        pickup_time: pickup_time || null,
        pickup_location: pickup_location || null,
        notes: notes || null,

        status: txStatus,
        paid_at: null,
        is_ecommerce: false,
      })
      .select()
      .single();

    if (txErr) {
      // ── Rollback: unit dibalikin ke SIAP_JUAL ───────────────────────────
      const { error: revertErr } = await supabaseAdmin
        .from("laptop_units")
        .update({ status: "SIAP_JUAL", reserved_by: null, reserved_invoice: null })
        .eq("id", unit_id);

      if (revertErr) {
        // Ini kondisi kritis: unit ke-lock tapi transaksi gagal dibuat DAN
        // revert-nya juga gagal. Harus di-log jelas supaya gampang dicari
        // di log server (bukan cuma "gagal", tapi termasuk unit_id & invoice
        // yang harus dicek manual).
        console.error(
          `[reserve] KRITIS: transaksi gagal dibuat & revert unit JUGA gagal. ` +
          `unit_id=${unit_id} invoice=${invoice_number} revertErr=${revertErr.message} txErr=${txErr.message}`
        );
      } else {
        console.error("[reserve] insert transaksi gagal, unit sudah di-revert:", txErr.message);
      }

      return NextResponse.json(
        { success: false, message: "Gagal membuat transaksi: " + txErr.message },
        { status: 500 }
      );
    }

    // ── 6. Update qty laptop (RESERVED/HELD tidak dikurangi qty) ──────────
    if (unit.laptop?.id) {
      const { data: remaining } = await supabaseAdmin
        .from("laptop_units")
        .select("id")
        .eq("laptop_id", unit.laptop.id)
        .eq("status", "SIAP_JUAL");

      const newQty = remaining?.length ?? 0;
      await supabaseAdmin
        .from("laptops")
        .update({ qty: newQty })
        .eq("id", unit.laptop.id);
    }

    return NextResponse.json({
      success: true,
      message: `✅ ${type === "RESERVED" ? "DP" : "Ambil Dulu"} berhasil dibuat — ${invoice_number}`,
      data: tx,
      invoice_number,
    });

  } catch (err: any) {
    console.error("[units/reserve]", err);
    return NextResponse.json(
      { success: false, message: err?.message ?? "Terjadi kesalahan" },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler, [
  "ADMIN",
  "PROGRAMMER",
  "ASISTEN_CEO",
  "KEPALA_SALES",
  "KEPALA_ZENITH",
  "CREW_SALES",
  "SOTECH",
  "PENGANTARAN",
  "PENYEDIA_BARANG",
  "KEPALA_PENYEDIA_BARANG",
  "KEPALA_SOTECH",
  "KEPALA_ONPOINT",
  "ONPOINT",
]);