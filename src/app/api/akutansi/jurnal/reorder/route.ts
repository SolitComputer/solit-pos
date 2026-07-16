import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export const PUT = withAuth(async (req) => {
  const body = await req.json();
  const { date, orderedIds } = body as { date: string; orderedIds: string[] };

  if (!date || !orderedIds || !Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

  const supabase = getAdmin();

  // We will rewrite the created_at of each entry for this specific date
  // to ensure they are sorted in the exact order specified by the user.
  // We'll use the base date string "YYYY-MM-DD" and append sequential times.
  const baseDate = new Date(`${date}T00:00:00Z`);

  try {
    const promises = orderedIds.map((id, index) => {
      // Adding index seconds to the base date
      const newCreatedAt = new Date(baseDate.getTime() + index * 1000).toISOString();
      return supabase
        .from("journal_entries")
        .update({ created_at: newCreatedAt })
        .eq("id", id);
    });

    await Promise.all(promises);

    return NextResponse.json({ success: true, message: "Order updated successfully" });
  } catch (error: any) {
    console.error("[akuntansi PUT reorder]", error);
    return NextResponse.json({ success: false, message: error?.message ?? "Failed to update order" }, { status: 500 });
  }
}, AKUNTANSI_MANAGE_ROLES);
