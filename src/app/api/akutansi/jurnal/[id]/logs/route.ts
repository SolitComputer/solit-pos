import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

export const GET = withAuth(async (_req, ctx) => {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ success: false, message: "ID tidak valid" }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const [auditRes, warningRes] = await Promise.all([
    supabase
      .from("journal_audit_logs")
      .select("*, changed_by_user:users!journal_audit_logs_changed_by_fkey(id, name)")
      .eq("entry_id", id),
    supabase
      .from("journal_warning_logs")
      .select("*, created_by_user:users!journal_warning_logs_created_by_fkey(id, name)")
      .eq("entry_id", id)
  ]);

  if (auditRes.error)
    return NextResponse.json({ success: false, message: auditRes.error.message }, { status: 500 });
  if (warningRes.error)
    return NextResponse.json({ success: false, message: warningRes.error.message }, { status: 500 });

  const combined = [
    ...(auditRes.data ?? []),
    ...(warningRes.data ?? []).map((w: any) => ({
      id: w.id,
      action: w.action, // "ACTIVATE" | "DEACTIVATE"
      changed_at: w.created_at, // Map created_at to changed_at
      changed_by_user: w.created_by_user,
      before_data: null,
      after_data: null,
      reason: w.reason
    }))
  ].sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());

  return NextResponse.json({ success: true, data: combined });
}, AKUNTANSI_ROLES);