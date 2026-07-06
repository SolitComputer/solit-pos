// src/app/api/cashflow/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { CASHFLOW_ROLES } from "@/lib/permissions";
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

function isCashflowUser(user: any): boolean {
  const roles: string[] =
    Array.isArray(user?.roles) && user.roles.length ? user.roles : [user?.role].filter(Boolean);
  return roles.some((r) => (CASHFLOW_ROLES as string[]).includes(r));
}

const SELECT_WITH_USERS = `
  *,
  created_by_user:users!cashflow_entries_created_by_fkey(id, name),
  audited_by_user:users!cashflow_entries_audited_by_fkey(id, name)
`;

// ── PATCH /api/cashflow/[id] — toggle audit ──────────────────────────────────
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  if (!isCashflowUser(user))
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ success: false, message: "ID tidak valid" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const action = body?.action ?? "toggle_audit";

  const supabase = getAdmin();

  const { data: current, error: fetchErr } = await supabase
    .from("cashflow_entries")
    .select("id, is_audited")
    .eq("id", id)
    .single();

  if (fetchErr || !current)
    return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

  if (action !== "toggle_audit")
    return NextResponse.json({ success: false, message: `Aksi '${action}' tidak dikenal` }, { status: 400 });

  const next = !current.is_audited;
  const { data, error } = await supabase
    .from("cashflow_entries")
    .update({
      is_audited: next,
      audited_by: next ? user.id : null,
      audited_at: next ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(SELECT_WITH_USERS)
    .single();

  if (error) {
    console.error("[cashflow PATCH]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

// ── DELETE /api/cashflow/[id] — hanya entry MANUAL yg boleh dihapus ───────────
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  if (!isCashflowUser(user))
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ success: false, message: "ID tidak valid" }, { status: 400 });

  const supabase = getAdmin();

  const { data: current } = await supabase
    .from("cashflow_entries")
    .select("id, source_type")
    .eq("id", id)
    .single();

  if (!current)
    return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

  if (current.source_type !== "MANUAL")
    return NextResponse.json(
      { success: false, message: "Entry otomatis (transaksi/service) tidak bisa dihapus manual" },
      { status: 400 }
    );

  const { error } = await supabase.from("cashflow_entries").delete().eq("id", id);
  if (error)
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}