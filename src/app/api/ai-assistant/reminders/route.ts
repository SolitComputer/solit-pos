import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { AI_ASSISTANT_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
  const userRoles: string[] =
    Array.isArray((user as any).roles) && (user as any).roles.length > 0
      ? (user as any).roles
      : user.role
      ? [user.role]
      : [];

  const roleFilters = userRoles.map((r) => `target_role.eq.${r}`).join(",");
  const orCondition = `target_user_id.eq.${user.id}` + (roleFilters ? `,${roleFilters}` : "");

  const { data, error } = await supabaseAdmin
    .from("ai_ceo_reminders")
    .select("id, title, message, severity, status, target_user_id, target_role, created_at, read_at, resolved_at, whatsapp_sent, whatsapp_error")
    .or(orCondition)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  }

  const rows = data ?? [];
  const unread = rows.filter((r) => r.status === "terkirim").length;
  const latest = rows.find((r) => r.status === "terkirim") ?? null;

  return NextResponse.json(
    { success: true, data: rows, unread, latest },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  );
}

export const GET = withAuth(getHandler, AI_ASSISTANT_ROLES);