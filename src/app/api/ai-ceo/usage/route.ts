import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { AI_CEO_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function todayRangeWIB() {
  const WIB = 7 * 60 * 60 * 1000;
  const nowWIB = new Date(Date.now() + WIB);
  const dateStr = nowWIB.toISOString().split("T")[0];
  const [y, m, d] = dateStr.split("-").map(Number);
  const startWIB = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - WIB);
  const endWIB = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - WIB);
  return { start: startWIB.toISOString(), end: endWIB.toISOString() };
}

async function getHandler(_req: NextRequest, _ctx: any, _user: AuthUser) {
  const { start, end } = todayRangeWIB();

  const [{ data, error }, { data: health }] = await Promise.all([
    supabaseAdmin
      .from("ai_ceo_messages")
      .select("provider, prompt_tokens, completion_tokens, total_tokens")
      .eq("role", "assistant")
      .gte("created_at", start)
      .lt("created_at", end)
      .not("provider", "is", null),
    supabaseAdmin.from("ai_ceo_provider_health").select("provider, blocked_until"),
  ]);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  const counts: Record<string, number> = {};
  const tokens: Record<string, { prompt: number; completion: number; total: number }> = {};
  for (const row of data ?? []) {
    const p = row.provider as string;
    counts[p] = (counts[p] ?? 0) + 1;
    if (!tokens[p]) tokens[p] = { prompt: 0, completion: 0, total: 0 };
    tokens[p].prompt += row.prompt_tokens ?? 0;
    tokens[p].completion += row.completion_tokens ?? 0;
    tokens[p].total += row.total_tokens ?? 0;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const now = Date.now();
  const blocked: Record<string, boolean> = {};
  for (const h of health ?? []) {
    blocked[h.provider as string] = h.blocked_until ? new Date(h.blocked_until).getTime() > now : false;
  }

 return NextResponse.json({ success: true, counts, total, blocked, tokens });
}

export const GET = withAuth(getHandler, AI_CEO_ROLES);