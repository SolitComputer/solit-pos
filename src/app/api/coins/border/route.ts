import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import type { EquippedBorder } from "@/lib/solit-coins/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type CatalogEmbed = {
  id: string;
  code: string;
  name: string;
  tier: EquippedBorder["tier"];
  style: EquippedBorder["style"];
};
type EquipRow = {
  user_id: string;
  border_catalog: CatalogEmbed | CatalogEmbed[] | null;
};

function toEquipped(row: EquipRow): EquippedBorder | null {
  const raw = row.border_catalog;
  const b = Array.isArray(raw) ? (raw[0] ?? null) : raw;
  if (!b) return null;
  return { id: b.id, code: b.code, name: b.name, tier: b.tier, style: b.style };
}

// GET ?userId=me|<id>  → { border }
// GET ?ids=<id>,<id>   → { borders: { [userId]: EquippedBorder|null } } (leaderboard)
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get("ids");

  const select = "user_id, border_catalog!inner(id, code, name, tier, style)";

  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100);
    if (ids.length === 0) return NextResponse.json({ success: true, data: { borders: {} } });

    const { data, error } = await supabase
      .from("user_equipped_border")
      .select(select)
      .in("user_id", ids);

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    const borders: Record<string, EquippedBorder | null> = {};
    for (const row of (data ?? []) as unknown as EquipRow[]) {
      borders[row.user_id] = toEquipped(row);
    }
    return NextResponse.json({ success: true, data: { borders } });
  }

  const q = searchParams.get("userId");
  const targetId = !q || q === "me" ? user.id : q;

  const { data, error } = await supabase
    .from("user_equipped_border")
    .select(select)
    .eq("user_id", targetId)
    .maybeSingle();

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    data: { border: data ? toEquipped(data as unknown as EquipRow) : null },
  });
}

export const GET = withAuth(getHandler);
