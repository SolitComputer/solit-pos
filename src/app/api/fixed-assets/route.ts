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

  const { data, error } = await supabase
    .from("fixed_assets")
    .insert({
      nama_aset: body.nama_aset.trim(),
      nominal,
      keterangan: body.keterangan ? String(body.keterangan).trim() : null,
      created_by: auth.userId || null,
      created_by_name: auth.userName || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}