import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { FIXED_ASSET_ROLES } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function getAuthContext(request: NextRequest): Promise<{ hasAccess: boolean; userName: string | null }> {
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
  if (!body || typeof body.nama_aset !== "string" || !body.nama_aset.trim()) {
    return NextResponse.json({ success: false, message: "Nama aset wajib diisi" }, { status: 400 });
  }

    const nominal = Number(body.nominal);
  if (!Number.isFinite(nominal) || nominal < 0) {
    return NextResponse.json({ success: false, message: "Nominal tidak valid" }, { status: 400 });
  }

  const namaAset = body.nama_aset.trim();
  const kategori = body.kategori ? String(body.kategori).trim() : null;
  const tanggalBeli = body.tanggal_beli || null;

  // Ambil data lama untuk bandingkan tiap field (bahan before/after)
  const { data: existing, error: fetchErr } = await supabase
    .from("fixed_assets")
    .select("nama_aset, nominal, kategori, keterangan, tanggal_beli")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ success: false, message: "Aset tidak ditemukan" }, { status: 404 });
  }

  // Keterangan hanya diubah kalau field-nya dikirim di body.
  // Modal Edit TIDAK mengirim keterangan, jadi nilai lama dipertahankan (fix bug keterangan kehapus).
  const keteranganProvided = Object.prototype.hasOwnProperty.call(body, "keterangan");
  const keteranganBaru = keteranganProvided
    ? (body.keterangan ? String(body.keterangan).trim() : null)
    : (existing.keterangan ?? null);

  const { data, error } = await supabase
    .from("fixed_assets")
    .update({
      nama_aset: namaAset,
      nominal,
      kategori,
      keterangan: keteranganBaru,
      tanggal_beli: tanggalBeli,
      updated_by_name: auth.userName || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  // Bandingkan tiap field, catat yang berubah ke riwayat (action = update)
  const norm = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
  const changes = [
    { field: "nama_aset", field_label: "Nama Aset", old: existing.nama_aset, now: namaAset },
    { field: "nominal", field_label: "Nominal", old: existing.nominal, now: nominal },
    { field: "kategori", field_label: "Kategori", old: existing.kategori, now: kategori },
    { field: "keterangan", field_label: "Keterangan", old: existing.keterangan, now: keteranganBaru },
    { field: "tanggal_beli", field_label: "Tanggal Beli", old: existing.tanggal_beli, now: tanggalBeli },
  ]
    .filter((c) => norm(c.old) !== norm(c.now))
    .map((c) => ({
      asset_id: id,
      action: "update",
      field: c.field,
      field_label: c.field_label,
      old_value: norm(c.old),
      new_value: norm(c.now),
      changed_by_name: auth.userName || null,
    }));

  if (changes.length > 0) {
    const { error: logErr } = await supabase.from("fixed_asset_change_logs").insert(changes);
    if (logErr) console.error("Gagal mencatat riwayat perubahan aset:", logErr.message);
  }

  return NextResponse.json({ success: true, data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthContext(request);

  if (!auth.hasAccess) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase.from("fixed_assets").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}