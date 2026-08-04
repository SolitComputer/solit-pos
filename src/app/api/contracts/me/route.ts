import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { CONTRACT_WARNING_DAYS } from "@/lib/contractTemplates";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("contract_status, active_contract_id, contract_valid_until")
    .eq("id", user.id)
    .maybeSingle();

  if (userError) {
    return NextResponse.json({ success: false, message: userError.message }, { status: 500 });
  }
  if (!userRow || !userRow.active_contract_id) {
    return NextResponse.json({ success: true, contract: null, contract_status: userRow?.contract_status ?? "NONE" });
  }

  const { data: contract, error: contractError } = await supabase
    .from("user_contracts")
    .select("id, contract_type, title, content, status, sent_at, responded_at, valid_from, valid_until, duration_months")
    .eq("id", userRow.active_contract_id)
    .maybeSingle();

  if (contractError) {
    return NextResponse.json({ success: false, message: contractError.message }, { status: 500 });
  }

  let daysLeft: number | null = null;
  let warning = false;
  if (userRow.contract_valid_until) {
    const todayWIB = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const diffMs = new Date(userRow.contract_valid_until).getTime() - new Date(todayWIB).getTime();
    daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    warning = userRow.contract_status === "APPROVED" && daysLeft <= CONTRACT_WARNING_DAYS && daysLeft >= 0;
  }

  return NextResponse.json({
    success: true,
    contract,
    contract_status: userRow.contract_status,
    valid_until: userRow.contract_valid_until,
    days_left: daysLeft,
    warning,
  });
}

export const GET = withAuth(getHandler);