import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { FIXED_ASSET_ROLES } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const AUDIT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 1 hari

async function getAuthContext(
  request: NextRequest
): Promise<{ hasAccess: boolean; userId: string | null; userName: string | null }> {
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

// GET: ambil riwayat audit 1 aset (terbaru di atas)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthContext(request);
  if (!auth.hasAccess) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("fixed_asset_audits")
    .select("id, catatan, audited_by_name, created_at")
    .eq("asset_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

// POST: tandai sudah diaudit + (opsional) timpa keterangan aset
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthContext(request);
  if (!auth.hasAccess) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const catatan =
    body && typeof body.catatan === "string" && body.catatan.trim() ? body.catatan.trim() : null;

  // Cek aset + cooldown 1 hari (backstop; UI juga sudah menyembunyikan tombol)
  const { data: asset, error: assetErr } = await supabase
    .from("fixed_assets")
    .select("id, last_audited_at")
    .eq("id", id)
    .single();

  if (assetErr || !asset) {
    return NextResponse.json({ success: false, message: "Aset tidak ditemukan" }, { status: 404 });
  }

  if (asset.last_audited_at) {
    const elapsed = Date.now() - new Date(asset.last_audited_at).getTime();
    if (elapsed < AUDIT_COOLDOWN_MS) {
      const jam = Math.ceil((AUDIT_COOLDOWN_MS - elapsed) / (60 * 60 * 1000));
      return NextResponse.json(
        { success: false, message: `Aset ini baru diaudit. Bisa audit lagi dalam ${jam} jam.` },
        { status: 409 }
      );
    }
  }

  const now = new Date().toISOString();

  // 1) Simpan riwayat
  const { error: logErr } = await supabase.from("fixed_asset_audits").insert({
    asset_id: id,
    catatan,
    audited_by: auth.userId || null,
    audited_by_name: auth.userName || null,
  });
  if (logErr) {
    return NextResponse.json({ success: false, message: logErr.message }, { status: 500 });
  }

  // 2) Update stempel audit; keterangan ikut berubah HANYA kalau catatan diisi
  const updatePayload: Record<string, unknown> = {
    last_audited_at: now,
    last_audited_by_name: auth.userName || null,
  };
  if (catatan !== null) {
    updatePayload.keterangan = catatan;
  }

  const { data: updated, error: updErr } = await supabase
    .from("fixed_assets")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (updErr) {
    return NextResponse.json({ success: false, message: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: updated });
}