import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { computeUserQuests } from "@/lib/solit-coins/engine";
import { resolveWalletBalance } from "@/lib/solit-coins/wallet";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
  const [quests, walletRes] = await Promise.all([
    computeUserQuests({ id: user.id, roles: user.roles }),
    supabase.from("user_wallets").select("balance").eq("user_id", user.id).maybeSingle(),
  ]);

  const { balance, unlimited } = resolveWalletBalance(user.roles, walletRes.data?.balance ?? 0);
  return NextResponse.json({
    success: true,
    data: { balance, unlimited, quests },
  });
}

export const GET = withAuth(getHandler);
