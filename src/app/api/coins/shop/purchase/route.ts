import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { isCoinUnlimited, ADMIN_COIN_BALANCE } from "@/lib/solit-coins/wallet";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ERROR_MESSAGES: Record<string, { message: string; status: number }> = {
  border_not_found: { message: "Border tidak ditemukan.", status: 404 },
  not_purchasable: { message: "Border ini tidak dijual.", status: 400 },
  already_owned: { message: "Border ini sudah kamu miliki.", status: 409 },
  insufficient_balance: { message: "Saldo Solit Coins tidak cukup.", status: 400 },
};

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const body = await req.json().catch(() => ({}));
  const borderId = typeof body?.borderId === "string" ? body.borderId : "";
  if (!borderId) {
    return NextResponse.json({ success: false, message: "borderId wajib diisi" }, { status: 400 });
  }

  // Admin: saldo unlimited — border langsung masuk koleksi tanpa potong saldo.
  if (isCoinUnlimited(user.roles)) {
    const { error: invErr } = await supabase
      .from("user_border_inventory")
      .upsert(
        { user_id: user.id, border_id: borderId },
        { onConflict: "user_id,border_id", ignoreDuplicates: true }
      );
    if (invErr) {
      return NextResponse.json({ success: false, message: invErr.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { balance: ADMIN_COIN_BALANCE, unlimited: true } });
  }

  const { data, error } = await supabase.rpc("sc_purchase_border", {
    p_user_id: user.id,
    p_border_id: borderId,
  });

  if (error) {
    const known = Object.keys(ERROR_MESSAGES).find((k) => error.message.includes(k));
    if (known) {
      const e = ERROR_MESSAGES[known];
      return NextResponse.json({ success: false, message: e.message }, { status: e.status });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { balance: data as number } });
}

export const POST = withAuth(postHandler);
