// src/app/api/seller-followup-reminders/read-all/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

async function patchHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
  const nowISO = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("seller_followup_reminders")
    .update({ is_read: true, read_at: nowISO })
    .eq("target_user_id", user.id)
    .eq("is_read", false);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export const PATCH = withAuth(patchHandler, PERMISSIONS.VIEW_SELLER_FOLLOWUP);