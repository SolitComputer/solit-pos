import { NextResponse } from "next/server";
import { getCurrentUser, isFullAccess } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const user = await getCurrentUser();

    console.log("[attendance/users] current user:", user?.id, user?.role);

    if (!user || !isFullAccess(user.role)) {
      console.log("[attendance/users] blocked — role:", user?.role);
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("users")
      .select("id, name, role")
      .order("name", { ascending: true }); 

    if (error) {
      console.error("[attendance/users] DB error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    console.log("[attendance/users] returned", data?.length, "users");
    return NextResponse.json({ success: true, data: data || [] });
  } catch (err) {
    console.error("[attendance/users] exception:", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}