import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export const PUT = withAuth(async (req) => {
  const body = await req.json();
  const { date, orderedIds, batches, sortOrder } = body as {
    date?: string;
    orderedIds?: string[];
    batches?: { date: string; orderedIds: string[] }[];
    sortOrder?: "asc" | "desc";
  };

  const list: { date: string; orderedIds: string[] }[] = [];
  if (batches && Array.isArray(batches)) {
    list.push(...batches.filter((b) => b.date && Array.isArray(b.orderedIds) && b.orderedIds.length > 0));
  } else if (date && orderedIds && Array.isArray(orderedIds) && orderedIds.length > 0) {
    list.push({ date, orderedIds });
  }

  if (list.length === 0) {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

  const supabase = getAdmin();

  try {
    const promises: Promise<any>[] = [];
    for (const item of list) {
      const baseDate = new Date(`${item.date}T00:00:00Z`);
      item.orderedIds.forEach((id, index) => {
        const offsetIndex = sortOrder === "desc" ? (item.orderedIds.length - 1 - index) : index;
        const newCreatedAt = new Date(baseDate.getTime() + offsetIndex * 1000).toISOString();
        promises.push(
          supabase
            .from("journal_entries")
            .update({ created_at: newCreatedAt })
            .eq("id", id)
        );
      });
    }

    await Promise.all(promises);

    return NextResponse.json({ success: true, message: "Order updated successfully", updatedDates: list.length });
  } catch (error: any) {
    console.error("[akuntansi PUT reorder]", error);
    return NextResponse.json({ success: false, message: error?.message ?? "Failed to update order" }, { status: 500 });
  }
}, AKUNTANSI_MANAGE_ROLES);
