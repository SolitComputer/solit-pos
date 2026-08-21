import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEAD_ASSET_ROLES } from "@/lib/permissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function hasAccess(request: NextRequest): boolean {
  const rolesHeader = request.headers.get("x-user-roles") || "";
  const singleRole = request.headers.get("x-user-role");
  const roles = rolesHeader ? rolesHeader.split(",").filter(Boolean) : singleRole ? [singleRole] : [];
  return roles.some((r) => (DEAD_ASSET_ROLES as string[]).includes(r));
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasAccess(request)) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }
  const { error } = await supabase.from("dead_assets").delete().eq("id", id);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}