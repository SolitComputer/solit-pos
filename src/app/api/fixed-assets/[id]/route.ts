import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { FIXED_ASSET_ROLES } from "@/lib/permissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function hasAccess(request: NextRequest): boolean {
  const rolesHeader = request.headers.get("x-user-roles") || "";
  const singleRole = request.headers.get("x-user-role");
  const roles = rolesHeader ? rolesHeader.split(",").filter(Boolean) : singleRole ? [singleRole] : [];
  return roles.some((r) => (FIXED_ASSET_ROLES as string[]).includes(r));
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasAccess(request)) {
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

  const userName = decodeURIComponent(request.headers.get("x-user-name") || "");

  const { data, error } = await supabase
    .from("fixed_assets")
    .update({
      nama_aset: body.nama_aset.trim(),
      nominal,
      keterangan: body.keterangan ? String(body.keterangan).trim() : null,
      updated_by_name: userName || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasAccess(request)) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase.from("fixed_assets").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}