import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { verifyClaimable } from "@/lib/solit-coins/engine";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const body = await req.json().catch(() => ({}));
  const questKey = typeof body?.questKey === "string" ? body.questKey : "";
  if (!questKey) {
    return NextResponse.json({ success: false, message: "questKey wajib diisi" }, { status: 400 });
  }

  // 1. Server yang verifikasi misi benar-benar selesai & layak diklaim.
  const check = await verifyClaimable({ id: user.id, roles: user.roles }, questKey);
  if (!check.ok) {
    const status = check.code === "not_completed" ? 400 : check.code === "not_found" ? 404 : 403;
    return NextResponse.json({ success: false, message: check.message }, { status });
  }

  // 2. RPC menjamin atomik + idempoten (double-claim ditolak lewat UNIQUE).
  const { data, error } = await supabase.rpc("sc_claim_quest", {
    p_user_id: user.id,
    p_quest_key: questKey,
    p_period_type: check.periodType,
    p_period_key: check.periodKey,
    p_reward: check.reward,
  });

  if (error) {
    if (error.message.includes("already_claimed")) {
      return NextResponse.json(
        { success: false, message: "Hadiah misi ini sudah diklaim." },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: { balance: data as number, reward: check.reward },
  });
}

export const POST = withAuth(postHandler);
