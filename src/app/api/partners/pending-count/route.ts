import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// GET /api/partners/pending-count
// Internal (auth required via middleware). Return jumlah partners PENDING.

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { count, error } = await supabase
    .from("partners")
    .select("id", { count: "exact", head: true })
    .eq("status", "PENDING");

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, count: count ?? 0 });
}