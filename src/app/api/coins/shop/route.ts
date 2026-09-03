import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import type { BorderInfo } from "@/lib/solit-coins/types";
import { resolveWalletBalance } from "@/lib/solit-coins/wallet";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
  const [catalogRes, invRes, equipBorderRes, equipBannerRes, walletRes] = await Promise.all([
    supabase
      .from("border_catalog")
      .select("id, code, name, tier, price_sc, style, is_purchasable, sort_order, item_type")
      .order("sort_order", { ascending: true }),
    supabase.from("user_border_inventory").select("border_id").eq("user_id", user.id),
    supabase.from("user_equipped_border").select("border_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("user_equipped_banner").select("border_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("user_wallets").select("balance").eq("user_id", user.id).maybeSingle(),
  ]);

  if (catalogRes.error) {
    return NextResponse.json({ success: false, message: catalogRes.error.message }, { status: 500 });
  }

  const owned = new Set((invRes.data ?? []).map((r: { border_id: string }) => r.border_id));
  const equippedBorderId = equipBorderRes.data?.border_id ?? null;
  const equippedBannerId = equipBannerRes.data?.border_id ?? null;

  const all = (catalogRes.data ?? []) as BorderInfo[];
  const borders = all
    .filter((b) => b.item_type === "BORDER")
    .map((b) => ({ ...b, owned: owned.has(b.id), equipped: b.id === equippedBorderId }));
  const banners = all
    .filter((b) => b.item_type === "BANNER")
    .map((b) => ({ ...b, owned: owned.has(b.id), equipped: b.id === equippedBannerId }));

  const { balance, unlimited } = resolveWalletBalance(user.roles, walletRes.data?.balance ?? 0);
  return NextResponse.json({
    success: true,
    data: { balance, unlimited, borders, banners },
  });
}

export const GET = withAuth(getHandler);
