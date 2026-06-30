import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_DELIVERY_ROLES } from "@/lib/permissions";

interface Props { params: Promise<{ id: string }>; }

const VALID = new Set(["ACQUIRING", "ACTIVE", "HIDDEN", "NO_PERMISSION", "NO_SIGNAL", "OFFLINE", "STOPPED"]);

// POST — device pengantar lapor status GPS (live). Observer baca via realtime preparation_orders.
async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const { status, reason } = await req.json();
    if (!status || !VALID.has(status)) {
      return NextResponse.json({ success: false, message: "status tidak valid" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("preparation_orders")
      .update({
        tracking_status: status,
        tracking_reason: reason ?? null,
        tracking_last_ping: now,
        tracking_updated_by: user.id,
      })
      .eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/preparation/[id]/heartbeat]", err);
    return NextResponse.json({ success: false, message: "Gagal update status tracking" }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, PREPARATION_DELIVERY_ROLES);