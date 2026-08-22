import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEAD_ASSET_ROLES } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function hasAccess(request: NextRequest): Promise<boolean> {
  const rolesHeader = request.headers.get("x-user-roles") || "";
  const singleRole = request.headers.get("x-user-role");
  let roles = rolesHeader ? rolesHeader.split(",").filter(Boolean) : singleRole ? [singleRole] : [];
  
  if (roles.length === 0) {
    try {
      const user = await getCurrentUser();
      if (user) {
        roles = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : [user.role];
      }
    } catch {
      // ignore
    }
  }

  return roles.some((r) => (DEAD_ASSET_ROLES as string[]).includes(r));
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const allowed = await hasAccess(request);
  if (!allowed) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }
  const { error } = await supabase.from("dead_assets").delete().eq("id", id);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}