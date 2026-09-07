import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const body = await req.json().catch(() => ({}));
  const borderId: string | null =
    typeof body?.borderId === "string" ? body.borderId : null;
  // Slot terpisah: border (ring avatar) vs banner (background profil).
  const table = body?.type === "BANNER" ? "user_equipped_banner" : "user_equipped_border";
  const label = body?.type === "BANNER" ? "banner" : "border";

  // Lepas item (unequip).
  if (borderId === null) {
    const { error } = await supabase.from(table).delete().eq("user_id", user.id);
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: { equipped: null } });
  }

  // Wajib memiliki item sebelum bisa dipasang (inventory generic).
  const { data: owned } = await supabase
    .from("user_border_inventory")
    .select("id")
    .eq("user_id", user.id)
    .eq("border_id", borderId)
    .maybeSingle();

  if (!owned) {
    return NextResponse.json(
      { success: false, message: `Kamu belum memiliki ${label} ini.` },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from(table)
    .upsert(
      { user_id: user.id, border_id: borderId, equipped_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data: { equipped: borderId } });
}

export const POST = withAuth(postHandler);
