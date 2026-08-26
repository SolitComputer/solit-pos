import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SERVICE_VIEW_ROLES, SERVICE_CREATE_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";
import type { ServiceStatus } from "@/types/service";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── GET /api/service?status=ANTRIAN&status=SEDANG_DIKERJAKAN ─────────────────
export const GET = withAuth(async (req, _ctx, user) => {
  const { searchParams } = new URL(req.url);
  const statuses = searchParams.getAll("status") as ServiceStatus[];
  const from = searchParams.get("from"); // ISO string, inclusive
  const to = searchParams.get("to");     // ISO string, exclusive

  const supabase = getAdmin();

  let query = supabase
    .from("service_orders")
    .select(`
      *,
      created_by_user:users!service_orders_created_by_fkey(id, name),
      dikerjakan_by_user:users!service_orders_dikerjakan_by_fkey(id, name),
      diambil_by_user:users!service_orders_diambil_by_fkey(id, name)
    `)
    .order("tanggal_masuk", { ascending: false });

  if (statuses.length > 0) {
    query = query.in("status", statuses);
  }
  // BARU: filter periode berdasarkan tanggal_masuk — field ini selalu terisi
  // untuk semua status (beda dengan tanggal_selesai/tanggal_diambil yang bisa
  // null di order TIDAK_JADI), jadi aman jadi acuan filter tanggal riwayat.
  if (from) query = query.gte("tanggal_masuk", from);
  if (to) query = query.lt("tanggal_masuk", to);

  const { data, error } = await query;

  if (error) {
    console.error("[service GET]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}, SERVICE_VIEW_ROLES);

// ── POST /api/service — buat formulir baru ───────────────────────────────────
export const POST = withAuth(async (req, _ctx, user) => {
  const body = await req.json();

  const {
    nama, no_hp, alamat,
    type_laptop, cpu, ram, storage, kelengkapan,
    keluhan, hasil_analisa,
  } = body;

  // Validasi field wajib
  if (!nama?.trim() || !no_hp?.trim() || !type_laptop?.trim() || !keluhan?.trim()) {
    return NextResponse.json(
      { success: false, message: "Nama, No HP, Type Laptop, dan Keluhan wajib diisi." },
      { status: 400 }
    );
  }

  const supabase = getAdmin();

  const { data: order, error } = await supabase
    .from("service_orders")
    .insert({
      nama: nama.trim(),
      no_hp: no_hp.trim(),
      alamat: alamat?.trim() || null,
      type_laptop: type_laptop.trim(),
      cpu: cpu?.trim() || null,
      ram: ram?.trim() || null,
      storage: storage?.trim() || null,
      kelengkapan: kelengkapan?.trim() || null,
      keluhan: keluhan.trim(),
      hasil_analisa: hasil_analisa?.trim() || null,
      status: "ANTRIAN",
      created_by: user.id,
      tanggal_masuk: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    console.error("[service POST]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  // Log awal
  await supabase.from("service_order_logs").insert({
    service_order_id: order.id,
    status_from: null,
    status_to: "ANTRIAN",
    catatan: "Formulir dibuat",
    changed_by: user.id,
  });

  return NextResponse.json({ success: true, data: order }, { status: 201 });
}, SERVICE_CREATE_ROLES);