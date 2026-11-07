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

/**
 * PUT: edit catatan audit yang sudah tersimpan.
 * - Tidak membuat record audit baru (hanya UPDATE row existing)
 * - Tidak mengubah last_audited_at / last_audited_by_name / cooldown
 * - Tidak mengubah field aset lain di tabel fixed_assets
 * - Validasi: auditId harus milik asset id yang sama (anti-tamper via URL)
 * - Perubahan dicatat ke fixed_asset_change_logs dengan action="audit_edit"
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; auditId: string }> }
) {
  const { id, auditId } = await params;
  const auth = await getAuthContext(request);

  if (!auth.hasAccess) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const catatan =
    body && typeof body.catatan === "string" && body.catatan.trim()
      ? body.catatan.trim()
      : null;

  // 1) Ambil record audit lama (sekaligus validasi kepemilikan asset)
  const { data: existing, error: fetchErr } = await supabase
    .from("fixed_asset_audits")
    .select("id, asset_id, catatan")
    .eq("id", auditId)
    .eq("asset_id", id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json(
      { success: false, message: "Data audit tidak ditemukan" },
      { status: 404 }
    );
  }

  const oldCatatan = existing.catatan ?? null;
  const newCatatan = catatan ?? null;

  // Tidak ada perubahan? langsung return success tanpa write apa pun
  if (oldCatatan === newCatatan) {
    return NextResponse.json({ success: true, data: existing, unchanged: true });
  }

  // 2) UPDATE catatan audit (bukan insert baru → tidak duplikat)
  const { data: updated, error: updErr } = await supabase
    .from("fixed_asset_audits")
    .update({ catatan: newCatatan })
    .eq("id", auditId)
    .eq("asset_id", id)
    .select("id, catatan, audited_by_name, created_at")
    .single();

  if (updErr) {
    return NextResponse.json({ success: false, message: updErr.message }, { status: 500 });
  }

  // 3) Catat ke riwayat perubahan supaya ter-track
  const { error: logErr } = await supabase.from("fixed_asset_change_logs").insert({
    asset_id: id,
    action: "audit_edit",
    field: "catatan_audit",
    field_label: "Catatan Audit",
    old_value: oldCatatan,
    new_value: newCatatan,
    changed_by: auth.userId || null,
    changed_by_name: auth.userName || null,
  });
  if (logErr) console.error("Gagal mencatat edit audit:", logErr.message);

  return NextResponse.json({ success: true, data: updated });
}