// src/app/api/service/[id]/warning/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { SERVICE_WARNING_ROLES, expandRolesWithParents, hasAnyRole } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

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

// Konsisten dengan [id]/route.ts — expand PKL ke parent role-nya
// (mis. PKL_CUSTOMER_SERVICE → CUSTOMER_SERVICE).
function getEffectiveRoles(user: { role: string; roles?: string[] }): string[] {
  return expandRolesWithParents(user.roles ?? [user.role]);
}

// ── POST /api/service/[id]/warning — AKTIFKAN / tandai ulang penanda ──────────
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  if (!hasAnyRole(getEffectiveRoles(user), SERVICE_WARNING_ROLES))
    return NextResponse.json({ success: false, message: "Anda tidak punya akses memberi penanda" }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ success: false, message: "ID tidak valid" }, { status: 400 });

  const { reason } = (await req.json()) as { reason?: string };
  if (!reason?.trim())
    return NextResponse.json({ success: false, message: "Alasan penanda wajib diisi" }, { status: 400 });

  const supabase = getAdmin();

  // pastikan order-nya ada
  const { data: order, error: findErr } = await supabase
    .from("service_orders").select("id").eq("id", id).single();
  if (findErr || !order)
    return NextResponse.json({ success: false, message: "Order tidak ditemukan" }, { status: 404 });

  const { error: updErr } = await supabase
    .from("service_orders").update({ has_warning: true }).eq("id", id);
  if (updErr) return NextResponse.json({ success: false, message: updErr.message }, { status: 500 });

  // log best-effort — kalau gagal, penanda tetap aktif
  await supabase.from("service_order_warning_logs").insert({
    service_order_id: id,
    action: "ACTIVATE",
    reason: reason.trim(),
    created_by: user.id,
  });

  return NextResponse.json({ success: true });
}

// ── DELETE /api/service/[id]/warning — NONAKTIFKAN penanda ───────────────────
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  if (!hasAnyRole(getEffectiveRoles(user), SERVICE_WARNING_ROLES))
    return NextResponse.json({ success: false, message: "Anda tidak punya akses menghapus penanda" }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ success: false, message: "ID tidak valid" }, { status: 400 });

  const supabase = getAdmin();

  const { error: updErr } = await supabase
    .from("service_orders").update({ has_warning: false }).eq("id", id);
  if (updErr) return NextResponse.json({ success: false, message: updErr.message }, { status: 500 });

  await supabase.from("service_order_warning_logs").insert({
    service_order_id: id,
    action: "DEACTIVATE",
    reason: null,
    created_by: user.id,
  });

  return NextResponse.json({ success: true });
}