import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { FIXED_ASSET_ROLES } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function getAuthContext(request: NextRequest): Promise<{ hasAccess: boolean; userId: string | null; userName: string | null }> {
  const rolesHeader = request.headers.get("x-user-roles") || "";
  const singleRole = request.headers.get("x-user-role");
  let roles = rolesHeader ? rolesHeader.split(",").filter(Boolean) : singleRole ? [singleRole] : [];
  let userId = request.headers.get("x-user-id");
  let userName = decodeURIComponent(request.headers.get("x-user-name") || "");

  if (roles.length === 0 || !userId) {
    try {
      const user = await getCurrentUser();
      if (user) {
        if (roles.length === 0) {
          roles = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : [user.role];
        }
        if (!userId) userId = user.id;
        if (!userName) userName = user.name;
      }
    } catch {
      // ignore
    }
  }

  const allowed = roles.some((r) => (FIXED_ASSET_ROLES as string[]).includes(r));
  return { hasAccess: allowed, userId, userName };
}

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth.hasAccess) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("fixed_assets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

export async function POST(request: NextRequest) {
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

  const kategori = body.kategori ? String(body.kategori).trim() : null;

  const { data, error } = await supabase
    .from("fixed_assets")
    .insert({
      nama_aset: body.nama_aset.trim(),
      nominal,
      kategori,
      keterangan: body.keterangan ? String(body.keterangan).trim() : null,
      tanggal_beli: body.tanggal_beli || null,
      created_by: auth.userId || null,
      created_by_name: auth.userName || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  // Catat inputan awal ke riwayat perubahan (action = create)
  const createLogs = [
    { field: "nama_aset", field_label: "Nama Aset", value: data.nama_aset },
    { field: "nominal", field_label: "Nominal", value: data.nominal != null ? String(data.nominal) : null },
    { field: "kategori", field_label: "Kategori", value: data.kategori },
    { field: "keterangan", field_label: "Keterangan", value: data.keterangan },
    { field: "tanggal_beli", field_label: "Tanggal Beli", value: data.tanggal_beli },
  ]
    .filter((f) => f.value !== null && f.value !== "")
    .map((f) => ({
      asset_id: data.id,
      action: "create",
      field: f.field,
      field_label: f.field_label,
      old_value: null,
      new_value: String(f.value),
      changed_by: auth.userId || null,
      changed_by_name: auth.userName || null,
    }));

  if (createLogs.length > 0) {
    const { error: logErr } = await supabase.from("fixed_asset_change_logs").insert(createLogs);
    if (logErr) console.error("Gagal mencatat riwayat create aset:", logErr.message);
  }

  return NextResponse.json({ success: true, data });
}