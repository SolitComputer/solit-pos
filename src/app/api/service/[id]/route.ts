// src/app/api/service/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { SERVICE_VIEW_ROLES, SERVICE_TEKNISI_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";
import type { ServiceStatus } from "@/types/service";
import type { UserRole } from "@/lib/permissions";
import { recordOutflow } from "@/lib/accessoryOutflow";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function getAuthUser(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  if (!SERVICE_VIEW_ROLES.includes(user.role as UserRole))
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ success: false, message: "ID tidak valid" }, { status: 400 });

  const supabase = getAdmin();
  const { data, error } = await supabase
    .from("service_orders")
    .select(`
      *,
      created_by_user:users!service_orders_created_by_fkey(id, name),
      dikerjakan_by_user:users!service_orders_dikerjakan_by_fkey(id, name),
      diambil_by_user:users!service_orders_diambil_by_fkey(id, name),
      payment_by_user:users!service_orders_payment_by_fkey(id, name)
    `)
    .eq("id", id)
    .single();

  if (error || !data)
    return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

  const { data: logs } = await supabase
    .from("service_order_logs")
    .select("*, changed_by_user:users!service_order_logs_changed_by_fkey(id, name)")
    .eq("service_order_id", id)
    .order("changed_at", { ascending: true });

  return NextResponse.json({ success: true, data: { ...data, logs: logs ?? [] } });
}

// ── PATCH /api/service/[id] ───────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  if (!SERVICE_VIEW_ROLES.includes(user.role as UserRole))
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ success: false, message: "ID tidak valid" }, { status: 400 });

  const body = await req.json();
  const {
    action,
    alasan,
    hasil_analisa,
    estimasi_harga,
    biaya_sparepart,
    payment_amount,
    payment_note,
    payment_method,
    accessories_used,
  } = body as {
    action: string;
    alasan?: string;
    hasil_analisa?: string;
    estimasi_harga?: number;
    biaya_sparepart?: number;
    payment_amount?: number;
    payment_note?: string;
    payment_method?: string;
    accessories_used?: { accessory_id: string; unit_id?: string; qty: number }[];
  };

  const supabase = getAdmin();
  const { data: current, error: fetchErr } = await supabase
    .from("service_orders")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !current)
    return NextResponse.json({ success: false, message: "Order tidak ditemukan" }, { status: 404 });

  const oldStatus: ServiceStatus = current.status;
  let newStatus: ServiceStatus;
  let updatePayload: Record<string, unknown> = {};
  let logCatatan = "";

  switch (action) {
    case "mulai":
      if (!SERVICE_TEKNISI_ROLES.includes(user.role as UserRole))
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      if (oldStatus !== "ANTRIAN" && oldStatus !== "MENUNGGU_SPAREPART")
        return NextResponse.json({ success: false, message: `Status '${oldStatus}' tidak valid` }, { status: 400 });
      newStatus = "SEDANG_DIKERJAKAN";
      updatePayload = {
        dikerjakan_by: user.id,
        ...(estimasi_harga !== undefined ? { estimasi_harga: Number(estimasi_harga) } : {}),
      };
      logCatatan = estimasi_harga
        ? `Mulai dikerjakan · Estimasi: Rp ${Number(estimasi_harga).toLocaleString("id-ID")}`
        : "Mulai dikerjakan";
      break;

    case "sparepart":
      if (!SERVICE_TEKNISI_ROLES.includes(user.role as UserRole))
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      if (oldStatus !== "SEDANG_DIKERJAKAN")
        return NextResponse.json({ success: false, message: "Status tidak valid" }, { status: 400 });
      newStatus = "MENUNGGU_SPAREPART";
      updatePayload = {
        ...(biaya_sparepart !== undefined ? { biaya_sparepart: Number(biaya_sparepart) } : {}),
      };
      logCatatan = biaya_sparepart
        ? `Menunggu sparepart · Biaya: Rp ${Number(biaya_sparepart).toLocaleString("id-ID")}${alasan ? ` · ${alasan}` : ""}`
        : (alasan ? `Menunggu sparepart: ${alasan}` : "Menunggu sparepart");
      break;

    case "done":
      if (!SERVICE_TEKNISI_ROLES.includes(user.role as UserRole))
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      if (oldStatus !== "SEDANG_DIKERJAKAN" && oldStatus !== "ANTRIAN" && oldStatus !== "MENUNGGU_SPAREPART")
        return NextResponse.json({ success: false, message: "Status tidak valid" }, { status: 400 });
      newStatus = "DONE";
      updatePayload = {
        dikerjakan_by: user.id,
        tanggal_selesai: new Date().toISOString(),
        ...(hasil_analisa ? { hasil_analisa } : {}),
        // Payment jika langsung diisi saat done
        ...(payment_amount !== undefined ? {
          payment_amount,
          payment_note: payment_note || null,
          payment_method: payment_method || "CASH",
          payment_by: user.id,
          payment_confirmed_at: new Date().toISOString(),
        } : {}),
      };
      logCatatan = payment_amount
        ? `Selesai · Biaya: Rp ${payment_amount.toLocaleString("id-ID")}`
        : "Pekerjaan selesai";

      if (accessories_used && accessories_used.length > 0) {
        for (const acc of accessories_used) {
          if (acc.unit_id) {
            await supabase.from("accessory_units").update({ status: "KELUAR" }).eq("id", acc.unit_id);
          }
          await recordOutflow({
            accessory_id: acc.accessory_id,
            unit_id: acc.unit_id || null,
            source_type: "service",
            service_id: id,
            qty: acc.qty,
            notes: `Dipakai untuk servis ${current.no_urut || id}`,
            taken_by_role: "TEKNISI",
            created_by: user.id,
          });
          await supabase.rpc("decrement_accessory_stock", {
            p_accessory_id: acc.accessory_id,
            p_qty: acc.qty,
          });
        }
      }
      break;

    case "gagal_diperbaiki":
      // ✅ NEW: teknisi tidak bisa perbaiki
      if (!SERVICE_TEKNISI_ROLES.includes(user.role as UserRole))
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      if (oldStatus !== "SEDANG_DIKERJAKAN" && oldStatus !== "MENUNGGU_SPAREPART" && oldStatus !== "ANTRIAN")
        return NextResponse.json({ success: false, message: "Status tidak valid" }, { status: 400 });
      if (!alasan?.trim())
        return NextResponse.json({ success: false, message: "Alasan wajib diisi" }, { status: 400 });
      newStatus = "GAGAL_DIPERBAIKI";
      updatePayload = {
        dikerjakan_by: user.id,
        tanggal_selesai: new Date().toISOString(),
        alasan_tidak_jadi: alasan.trim(),
      };
      logCatatan = `Gagal diperbaiki: ${alasan.trim()}`;
      break;

    case "diambil":
      if (oldStatus !== "DONE" && oldStatus !== "GAGAL_DIPERBAIKI")
        return NextResponse.json({ success: false, message: "Status tidak valid untuk diambil" }, { status: 400 });
      newStatus = "SUDAH_DIAMBIL";
      updatePayload = {
        diambil_by: user.id,
        tanggal_diambil: new Date().toISOString(),
        ...(payment_amount !== undefined && payment_amount > 0 ? {
          payment_amount,
          payment_note: payment_note || null,
          payment_method: payment_method || "CASH",
          payment_by: user.id,
          payment_confirmed_at: new Date().toISOString(),
        } : {}),
      };
      logCatatan = payment_amount
        ? `Laptop sudah diambil · Biaya: Rp ${payment_amount.toLocaleString("id-ID")}`
        : "Laptop sudah diambil pelanggan";
      break;

    case "tidak_jadi":
      if (oldStatus !== "DONE")
        return NextResponse.json({ success: false, message: "Hanya DONE yang bisa tidak jadi" }, { status: 400 });
      if (!alasan?.trim())
        return NextResponse.json({ success: false, message: "Alasan wajib diisi" }, { status: 400 });
      newStatus = "TIDAK_JADI";
      updatePayload = { alasan_tidak_jadi: alasan.trim(), tanggal_selesai: null, dikerjakan_by: null };
      logCatatan = `Tidak jadi: ${alasan.trim()}`;
      break;

    case "kembali_antrian":
      if (oldStatus !== "TIDAK_JADI" && oldStatus !== "GAGAL_DIPERBAIKI")
        return NextResponse.json({ success: false, message: "Status tidak valid" }, { status: 400 });
      if (!SERVICE_TEKNISI_ROLES.includes(user.role as UserRole))
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      newStatus = "ANTRIAN";
      updatePayload = { alasan_tidak_jadi: null, tanggal_selesai: null };
      logCatatan = "Dikembalikan ke antrian";
      break;

    // ✅ Update payment saja (tanpa ubah status)
    case "update_payment":
      if (payment_amount === undefined)
        return NextResponse.json({ success: false, message: "Jumlah biaya wajib diisi" }, { status: 400 });
      const { data: paid, error: payErr } = await supabase
        .from("service_orders")
        .update({
          payment_amount,
          payment_note: payment_note || null,
          payment_method: payment_method || "CASH",
          payment_by: user.id,
          payment_confirmed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();
      if (payErr) return NextResponse.json({ success: false, message: payErr.message }, { status: 500 });
      await supabase.from("service_order_logs").insert({
        service_order_id: id,
        status_from: oldStatus,
        status_to: oldStatus,
        catatan: `Payment diperbarui: Rp ${payment_amount.toLocaleString("id-ID")} · ${payment_method || "CASH"}`,
        changed_by: user.id,
      });
      return NextResponse.json({ success: true, data: paid });

    default:
      return NextResponse.json({ success: false, message: `Aksi '${action}' tidak dikenal` }, { status: 400 });
  }

  const { data: updated, error: updateErr } = await supabase
    .from("service_orders")
    .update({ status: newStatus, ...updatePayload })
    .eq("id", id)
    .select("*")
    .single();

  if (updateErr) return NextResponse.json({ success: false, message: updateErr.message }, { status: 500 });

  await supabase.from("service_order_logs").insert({
    service_order_id: id,
    status_from: oldStatus,
    status_to: newStatus,
    catatan: logCatatan,
    changed_by: user.id,
  });

  return NextResponse.json({ success: true, data: updated });
}