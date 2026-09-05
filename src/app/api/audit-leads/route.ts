import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyToken } from "@/lib/auth";
import { AUDIT_LEADS_INPUT_ROLES, hasAnyRole } from "@/lib/permissions";

const VALID_CHANNELS = ["WA", "FB", "OLX", "CAROUSEL", "MITRA", "RESELLER"];

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function getAuthedUser(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return null;
  const user = await verifyToken(token);
  if (!user) return null;
  const roles: string[] =
    Array.isArray((user as any).roles) && (user as any).roles.length > 0
      ? (user as any).roles
      : [(user as any).role].filter(Boolean);
  return { ...(user as any), roles };
}

// GET /api/audit-leads?channel=WA — gabungan leads manual (audit_leads) +
// leads dari Laporan Harian Sales (sales_reports), difilter per channel.
export async function GET(request: NextRequest) {
  const user = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const channel = searchParams.get("channel");
  if (!channel || !VALID_CHANNELS.includes(channel)) {
    return NextResponse.json({ success: false, message: "Channel tidak valid." }, { status: 400 });
  }

  const supabase = getSupabase();

  // Sumber 1: leads yang diinput manual langsung di halaman Audit Marketing
  const { data: manualRows, error: manualError } = await supabase
    .from("audit_leads")
    .select("*")
    .eq("channel", channel);

  if (manualError) {
    console.error("API Error (GET /api/audit-leads, manual):", manualError);
    return NextResponse.json({ success: false, message: "Gagal mengambil data." }, { status: 500 });
  }

    // Sumber 2: leads yang diinput sales lewat Laporan Harian Sales
  const { data: salesRows, error: salesError } = await supabase
    .from("sales_online_reports")
    .select("*")
    .eq("channel", channel);

  if (salesError) {
    console.error("API Error (GET /api/audit-leads, sales_reports):", salesError);
    return NextResponse.json({ success: false, message: "Gagal mengambil data." }, { status: 500 });
  }

  const mappedManual = (manualRows ?? []).map((r) => ({
    id: r.id,
    channel: r.channel,
    nama: r.nama,
    minat: r.minat,
    keterangan: r.keterangan,
    transaksi: r.transaksi,
    ads: r.ads,
    audited: r.audited,
    audited_by_name: r.audited_by_name,
    created_by: r.created_by,
    created_by_name: r.created_by_name,
    created_at: r.created_at,
    source: "manual" as const,
  }));

  const mappedSales = (salesRows ?? []).map((r) => ({
    id: r.id,
    channel: r.channel,
    nama: r.phone_number || r.partner_name || "-",
    minat: r.interest,
    keterangan: r.keterangan,
    transaksi: r.purchased,
    ads: false,
    audited: r.audited,
    audited_by_name: r.audited_by_name,
    created_by: r.filled_by,
    created_by_name: r.filled_by_name,
    created_at: r.created_at,
    source: "sales_report" as const,
  }));

  const data = [...mappedManual, ...mappedSales].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return NextResponse.json({ success: true, data });
}

// POST /api/audit-leads — tambah leads baru
export async function POST(request: NextRequest) {
  const user = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!hasAnyRole(user.roles, AUDIT_LEADS_INPUT_ROLES)) {
    return NextResponse.json({ success: false, message: "Kamu tidak punya akses untuk menambah leads." }, { status: 403 });
  }

  const body = await request.json();
  const { channel, nama, minat, keterangan, transaksi, ads } = body;

  if (!channel || !VALID_CHANNELS.includes(channel)) {
    return NextResponse.json({ success: false, message: "Channel tidak valid." }, { status: 400 });
  }
  if (!nama?.trim() || !minat?.trim()) {
    return NextResponse.json({ success: false, message: "Nama dan minat wajib diisi." }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: userData } = await supabase
    .from("users")
    .select("name")
    .eq("id", user.id)
    .single();

  const { data, error } = await supabase
    .from("audit_leads")
    .insert({
      channel,
      nama: nama.trim(),
      minat: minat.trim(),
      keterangan: keterangan?.trim() || null,
      transaksi: Boolean(transaksi),
      ads: Boolean(ads),
      audited: false,
      created_by: user.id,
      created_by_name: userData?.name ?? "Unknown",
    })
    .select()
    .single();

  if (error) {
    console.error("API Error (POST /api/audit-leads):", error);
    return NextResponse.json({ success: false, message: "Gagal menyimpan data." }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

// PATCH /api/audit-leads — edit leads (hanya sebelum diaudit)
export async function PATCH(request: NextRequest) {
  const user = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!hasAnyRole(user.roles, AUDIT_LEADS_INPUT_ROLES)) {
    return NextResponse.json({ success: false, message: "Kamu tidak punya akses untuk mengedit leads." }, { status: 403 });
  }

  const body = await request.json();
  const { id, nama, minat, keterangan, transaksi, ads } = body;

  if (!id) {
    return NextResponse.json({ success: false, message: "ID tidak ditemukan." }, { status: 400 });
  }
  if (!nama?.trim() || !minat?.trim()) {
    return NextResponse.json({ success: false, message: "Nama dan minat wajib diisi." }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("audit_leads")
    .select("audited")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ success: false, message: "Data tidak ditemukan." }, { status: 404 });
  }
  if (existing.audited) {
    return NextResponse.json({ success: false, message: "Data sudah diaudit, tidak bisa diedit." }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("audit_leads")
    .update({
      nama: nama.trim(),
      minat: minat.trim(),
      keterangan: keterangan?.trim() || null,
      transaksi: Boolean(transaksi),
      ads: Boolean(ads),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("API Error (PATCH /api/audit-leads):", error);
    return NextResponse.json({ success: false, message: "Gagal memperbarui data." }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

// DELETE /api/audit-leads?id=... — hapus leads (hanya sebelum diaudit)
export async function DELETE(request: NextRequest) {
  const user = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!hasAnyRole(user.roles, AUDIT_LEADS_INPUT_ROLES)) {
    return NextResponse.json({ success: false, message: "Kamu tidak punya akses untuk menghapus leads." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, message: "ID tidak ditemukan." }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("audit_leads")
    .select("audited")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ success: false, message: "Data tidak ditemukan." }, { status: 404 });
  }
  if (existing.audited) {
    return NextResponse.json({ success: false, message: "Data sudah diaudit, tidak bisa dihapus." }, { status: 409 });
  }

  const { error } = await supabase.from("audit_leads").delete().eq("id", id);

  if (error) {
    console.error("API Error (DELETE /api/audit-leads):", error);
    return NextResponse.json({ success: false, message: "Gagal menghapus data." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}