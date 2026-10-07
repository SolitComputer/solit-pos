import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { FIXED_ASSET_ROLES } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function getAuthContext(
  request: NextRequest
): Promise<{ hasAccess: boolean; userName: string | null }> {
  const rolesHeader = request.headers.get("x-user-roles") || "";
  const singleRole = request.headers.get("x-user-role");
  let roles = rolesHeader ? rolesHeader.split(",").filter(Boolean) : singleRole ? [singleRole] : [];
  let userName = decodeURIComponent(request.headers.get("x-user-name") || "");

  if (roles.length === 0 || !userName) {
    try {
      const user = await getCurrentUser();
      if (user) {
        if (roles.length === 0) {
          roles = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : [user.role];
        }
        if (!userName) userName = user.name;
      }
    } catch {
      // ignore
    }
  }

  const allowed = roles.some((r) => (FIXED_ASSET_ROLES as string[]).includes(r));
  return { hasAccess: allowed, userName };
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthContext(request);

  if (!auth.hasAccess) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.nama !== "string" || !body.nama.trim()) {
    return NextResponse.json({ success: false, message: "Nama wajib diisi" }, { status: 400 });
  }

  const nominal = Number(body.nominal);
  if (!Number.isFinite(nominal) || nominal < 0) {
    return NextResponse.json({ success: false, message: "Nominal tidak valid" }, { status: 400 });
  }

  // Ambil data lama untuk bandingkan nominal (bahan riwayat)
  const { data: existing, error: fetchError } = await supabase
    .from("financial_entries")
    .select("nominal")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("financial_entries")
    .update({
      nama: body.nama.trim(),
      nominal,
      tanggal: body.tanggal || null,
      keterangan: body.keterangan ? String(body.keterangan).trim() : null,
      updated_by_name: auth.userName || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  // Catat riwayat hanya kalau nominal berubah
  const nominalLama = Number(existing.nominal);
  if (nominalLama !== nominal) {
    const { error: historyError } = await supabase
      .from("financial_entry_nominal_history")
      .insert({
        entry_id: id,
        nominal_lama: nominalLama,
        nominal_baru: nominal,
        changed_by_name: auth.userName || null,
      });
    if (historyError) {
      // Jangan gagalkan update utama kalau cuma pencatatan riwayat yang error
      console.error("Gagal mencatat riwayat nominal:", historyError.message);
    }
  }

  return NextResponse.json({ success: true, data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthContext(request);

  if (!auth.hasAccess) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  // Hapus riwayat nominal dulu (aman walau sudah ada ON DELETE CASCADE)
  await supabase.from("financial_entry_nominal_history").delete().eq("entry_id", id);

  const { error } = await supabase.from("financial_entries").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}