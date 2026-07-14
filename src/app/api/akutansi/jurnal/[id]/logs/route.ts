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

  const { data, error } = await supabase
    .from("journal_audit_logs")
    .select("*, changed_by_user:users!journal_audit_logs_changed_by_fkey(id, name)")
    .eq("entry_id", id)
    .order("changed_at", { ascending: false });

  if (error)
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data: data ?? [] });
}, AKUNTANSI_ROLES);