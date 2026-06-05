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
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    // ✅ Build query berdasarkan role
    let query = supabase
      .from("face_verifications")
      .select(`
        *,
        users!inner (
          id,
          name,
          role
        )
      `)
      .order("created_at", { ascending: false });

    if (user.role !== "ADMIN") {
      query = query.eq("user_id", user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    const formattedData =
      data?.map((item: any) => ({
        id: item.id,
        user_name: item.users?.name || "Unknown",
        user_role: item.users?.role || "STAFF",
        date: item.created_at,
        check_in_time: item.created_at,
        status:
          item.status === "SUCCESS"
            ? "PRESENT"
            : item.status === "SKIPPED_MANUAL"
            ? "PRESENT"
            : "LATE",
        method: item.status === "SUCCESS" ? "FACE" : "FORCE",
        latitude: item.latitude,
        longitude: item.longitude,
        accuracy: item.accuracy,
        device: item.device,
        ip_address: item.ip_address,
        face_distance: item.face_distance,
        created_at: item.created_at,
      })) || [];

    return NextResponse.json({ success: true, data: formattedData });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}