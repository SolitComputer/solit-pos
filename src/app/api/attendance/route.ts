import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    let query = supabase
      .from("face_verifications")
      .select(`
        *,
        users!inner (
          id,
          name,
          role,
          shift
        )
      `)
      .in("status", ["SUCCESS"])
      .order("created_at", { ascending: true });

    if (user.role !== "ADMIN") {
      query = query.eq("user_id", user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const seen = new Set<string>();
    const deduplicated = (data ?? []).filter((item: any) => {
      const wibDate = new Date(new Date(item.created_at).getTime() + 7 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      const key = `${item.user_id}_${wibDate}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const formattedData = deduplicated.map((item: any) => ({
      id:            item.id,
      user_name:     item.users?.name  || "Unknown",
      user_role:     item.users?.role  || "STAFF",
      user_shift:    item.users?.shift ?? "PAGI",
      date:          item.created_at,
      check_in_time: item.created_at,
      status:        item.status,                                         
      method:        item.status === "SUCCESS" ? "FACE" : "SKIP",        
      latitude:      item.latitude,
      longitude:     item.longitude,
      accuracy:      item.accuracy,
      device:        item.device,
      ip_address:    item.ip_address,
      face_distance: item.face_distance,
      created_at:    item.created_at,
    }));

    return NextResponse.json({ success: true, data: formattedData });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}