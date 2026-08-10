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
    payment_status, //  NEW
    total_tagihan, //  NEW
    cicilan_amount, //  NEW
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
    payment_status?: "LUNAS" | "DP"; //  NEW
    total_tagihan?: number; //  NEW
    cicilan_amount?: number; //  NEW
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

  //  NEW — dipakai buat cek boleh/tidaknya aksi bayar-di-muka & pelunasan
  const isOrderSelesai = oldStatus === "DONE" || oldStatus === "GAGAL_DIPERBAIKI";
  const isOrderAktif = oldStatus === "ANTRIAN" || oldStatus === "SEDANG_DIKERJAKAN" || oldStatus === "MENUNGGU_SPAREPART";

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

      if (payment_status === "DP") {
        //  NEW — bayar DP: order TETAP di status semula (DONE/GAGAL_DIPERBAIKI), belum diambil
        if (!payment_amount || payment_amount <= 0)
          return NextResponse.json({ success: false, message: "Nominal DP wajib diisi" }, { status: 400 });
        newStatus = oldStatus;
        updatePayload = {
          payment_status: "DP",
          total_tagihan: total_tagihan ?? payment_amount,
          payment_amount,
          payment_note: payment_note || null,
          payment_method: payment_method || "CASH",
          payment_by: user.id,
          payment_confirmed_at: new Date().toISOString(),
        };
        logCatatan = `DP diterima · Rp ${payment_amount.toLocaleString("id-ID")} dari total Rp ${Number(total_tagihan ?? payment_amount).toLocaleString("id-ID")}`;
      } else {
        newStatus = "SUDAH_DIAMBIL";
        updatePayload = {
          diambil_by: user.id,
          tanggal_diambil: new Date().toISOString(),
          ...(payment_amount !== undefined && payment_amount > 0 ? {
            payment_amount,
            payment_status: "LUNAS", //  NEW
            total_tagihan: total_tagihan ?? payment_amount, //  NEW
            payment_note: payment_note || null,
            payment_method: payment_method || "CASH",
            payment_by: user.id,
            payment_confirmed_at: new Date().toISOString(),
          } : {}),
        };
        logCatatan = payment_amount
          ? `Laptop sudah diambil · Biaya: Rp ${payment_amount.toLocaleString("id-ID")}`
          : "Laptop sudah diambil pelanggan";
      }
      break;

    //  NEW — pelunasan sisa DP (bisa dari halaman Selesai ATAU dari Antrian/bayar di muka)
    case "bayar_lunas": {
      if (current.payment_status !== "DP")
        return NextResponse.json({ success: false, message: "Order ini tidak dalam status DP" }, { status: 400 });
      if (!isOrderSelesai && !isOrderAktif)
        return NextResponse.json({ success: false, message: "Status tidak valid" }, { status: 400 });

      const totalTagihanLunas = Number(current.total_tagihan ?? 0);
      const sisaLunas = totalTagihanLunas - Number(current.payment_amount ?? 0);

      //  NEW — cuma tandai "diambil" kalau servisnya memang SUDAH selesai dikerjakan
      newStatus = isOrderSelesai ? "SUDAH_DIAMBIL" : oldStatus;
      updatePayload = {
        payment_amount: totalTagihanLunas,
        payment_status: "LUNAS",
        payment_confirmed_at: new Date().toISOString(),
        ...(isOrderSelesai ? {
          diambil_by: user.id,
          tanggal_diambil: new Date().toISOString(),
        } : {}),
      };
      logCatatan = `Pelunasan sisa DP · Rp ${sisaLunas.toLocaleString("id-ID")} · Total lunas Rp ${totalTagihanLunas.toLocaleString("id-ID")}`;
      break;
    }

    //  NEW — cicilan sebagian dari sisa DP (bisa dari halaman Selesai ATAU Antrian/bayar di muka)
    case "bayar_cicilan": {
      if (current.payment_status !== "DP")
        return NextResponse.json({ success: false, message: "Order ini tidak dalam status DP" }, { status: 400 });
      if (!isOrderSelesai && !isOrderAktif)
        return NextResponse.json({ success: false, message: "Status tidak valid" }, { status: 400 });
      if (!cicilan_amount || cicilan_amount <= 0)
        return NextResponse.json({ success: false, message: "Nominal cicilan wajib diisi" }, { status: 400 });

      const totalTagihanCicil = Number(current.total_tagihan ?? 0);
      const sudahDibayar = Number(current.payment_amount ?? 0);
      const totalBaru = sudahDibayar + cicilan_amount;
      const sudahLunas = totalBaru >= totalTagihanCicil;
      const tandaiDiambil = sudahLunas && isOrderSelesai;

      newStatus = tandaiDiambil ? "SUDAH_DIAMBIL" : oldStatus;
      updatePayload = {
        payment_amount: totalBaru,
        payment_status: sudahLunas ? "LUNAS" : "DP",

        payment_confirmed_at: new Date().toISOString(),
        ...(tandaiDiambil ? {
          diambil_by: user.id,
          tanggal_diambil: new Date().toISOString(),
        } : {}),
      };
      logCatatan = sudahLunas
        ? `Cicilan Rp ${cicilan_amount.toLocaleString("id-ID")} · Lunas total Rp ${totalBaru.toLocaleString("id-ID")}`
        : `Cicilan Rp ${cicilan_amount.toLocaleString("id-ID")} · Sisa Rp ${(totalTagihanCicil - totalBaru).toLocaleString("id-ID")}`;
      break;
    }

    //  NEW — bayar di muka: servis masih ANTRIAN/dikerjakan, tapi uangnya sudah masuk (lunas atau DP)
    case "bayar_dimuka": {
      if (!isOrderAktif)
        return NextResponse.json({ success: false, message: "Bayar di muka hanya untuk order yang masih dalam antrian/dikerjakan" }, { status: 400 });
      if (current.payment_amount) //  FIX — payment_status bisa default "LUNAS" di DB walau belum ada duit masuk sama sekali
        return NextResponse.json({ success: false, message: "Order ini sudah punya catatan pembayaran. Gunakan tombol Lunas/Cicil." }, { status: 400 });
      if (!payment_amount || payment_amount <= 0)
        return NextResponse.json({ success: false, message: "Nominal pembayaran wajib diisi" }, { status: 400 });

      const statusBayarDimuka = payment_status === "DP" ? "DP" : "LUNAS";
      const totalTagihanDimuka = statusBayarDimuka === "DP" ? Number(total_tagihan ?? payment_amount) : payment_amount;

      newStatus = oldStatus; // status servis TIDAK berubah — cuma catat pembayarannya
      updatePayload = {
        payment_amount,
        payment_status: statusBayarDimuka,
        total_tagihan: totalTagihanDimuka,
        payment_note: payment_note || null,
        payment_method: payment_method || "CASH",
        payment_by: user.id,
        payment_confirmed_at: new Date().toISOString(),
      };
      logCatatan = statusBayarDimuka === "LUNAS"
        ? `Bayar di muka (LUNAS) · Rp ${payment_amount.toLocaleString("id-ID")}`
        : `DP di muka · Rp ${payment_amount.toLocaleString("id-ID")} dari total Rp ${totalTagihanDimuka.toLocaleString("id-ID")}`;
      break;
    }

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
      if (payment_amount === undefined || !Number.isFinite(Number(payment_amount)) || Number(payment_amount) < 0)
        return NextResponse.json({ success: false, message: "Jumlah biaya wajib diisi dan tidak boleh negatif" }, { status: 400 });
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