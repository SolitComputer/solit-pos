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
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("user_id");

    let q = supabase
      .from("user_schedule")
      .select("id, user_id, day_of_week, start_hour, start_minute, late_hour, late_minute, end_hour, end_minute, notes")
      .order("user_id").order("day_of_week");

    if (user.role !== "ADMIN") {
      q = q.eq("user_id", user.id);
    } else if (targetUserId) {
      q = q.eq("user_id", targetUserId);
    }

    const { data, error } = await q;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data: data || [] });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Hanya admin" }, { status: 403 });
    }

    const body = await request.json();
    const { user_id, day_of_week, start_hour, start_minute = 0, late_hour, late_minute = 0, end_hour, end_minute = 0, notes } = body;

    if (!user_id || day_of_week === undefined || start_hour === undefined || late_hour === undefined || end_hour === undefined) {
      return NextResponse.json({ success: false, message: "Semua field wajib diisi" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("user_schedule")
      .upsert({
        user_id, day_of_week,
        start_hour, start_minute,
        late_hour,  late_minute,
        end_hour,   end_minute,
        notes: notes || null,
        created_by: user.id,
      }, { onConflict: "user_id,day_of_week" })
      .select().single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Hanya admin" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const user_id    = searchParams.get("user_id");
    const day_of_week = searchParams.get("day_of_week");

    if (!user_id || day_of_week === null) {
      return NextResponse.json({ success: false, message: "user_id dan day_of_week wajib" }, { status: 400 });
    }

    const { error } = await supabase
      .from("user_schedule")
      .delete()
      .eq("user_id", user_id)
      .eq("day_of_week", Number(day_of_week));

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}