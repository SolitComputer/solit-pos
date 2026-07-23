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
  const { date, orderedIds, sortOrder } = body as {
    date: string;
    orderedIds: string[];
    sortOrder?: "asc" | "desc";
  };

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
      // Index tampilan (top-to-bottom) harus diterjemahkan ke created_at sesuai arah sort aktif:
      // - sortOrder "desc" (terbaru di atas) → baris PALING ATAS harus dapat created_at PALING BARU,
      //   supaya tetap di atas saat data di-reload dengan urutan desc.
      // - sortOrder "asc" / tidak dikirim → tetap seperti perilaku lama (baris atas = created_at paling lama).
      const offsetIndex = sortOrder === "desc" ? (orderedIds.length - 1 - index) : index;
      const newCreatedAt = new Date(baseDate.getTime() + offsetIndex * 1000).toISOString();
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
