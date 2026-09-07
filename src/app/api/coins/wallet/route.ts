import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { resolveWalletBalance } from "@/lib/solit-coins/wallet";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
  const { data, error } = await supabase
    .from("user_wallets")
    .select("balance")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const { balance, unlimited } = resolveWalletBalance(user.roles, data?.balance ?? 0);
  return NextResponse.json({ success: true, data: { balance, unlimited } });
}

export const GET = withAuth(getHandler);
