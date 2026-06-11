import { NextResponse } from "next/server";
import { getCurrentUser, isFullAccess } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ✅ FIX: Definisi konstanta yang benar
const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("user_id");
    const year = searchParams.get("year");
    const month = searchParams.get("month");

    let q = supabase
      .from("user_date_schedule")
      .select("id, user_id, schedule_date, start_hour, start_minute, late_hour, late_minute, end_hour, end_minute, notes")
      .order("schedule_date", { ascending: true });

    // ✅ FIX: Sebelumnya `user.role !== "ADMIN", "PROGRAMMER", "ASISTEN_CEO"`
    // itu adalah comma operator — hanya evaluasi "ASISTEN_CEO" (truthy) → selalu true
    // Akibatnya semua user dianggap non-admin dan di-filter ke user_id sendiri
    if (!FULL_ACCESS_ROLES.includes(user.role)) {
      q = q.eq("user_id", user.id);
    } else if (targetUserId) {
      q = q.eq("user_id", targetUserId);
    }

    if (year && month) {
      const paddedMonth = String(month).padStart(2, "0");
      const from = `${year}-${paddedMonth}-01`;
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      const to = `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`;
      q = q.gte("schedule_date", from).lte("schedule_date", to);
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
    if (!user || !isFullAccess(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const body = await request.json();
    const {
      user_id, schedule_date,
      start_hour, start_minute = 0,
      late_hour, late_minute = 0,
      end_hour, end_minute = 0,
      notes
    } = body;

    if (!user_id || !schedule_date || start_hour === undefined || late_hour === undefined || end_hour === undefined) {
      return NextResponse.json({ success: false, message: "Semua field wajib" }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(schedule_date)) {
      return NextResponse.json({ success: false, message: "Format: YYYY-MM-DD" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("user_date_schedule")
      .upsert({
        user_id, schedule_date,
        start_hour, start_minute,
        late_hour, late_minute,
        end_hour, end_minute,
        notes: notes || null,
        created_by: user.id,
      }, { onConflict: "user_id,schedule_date" })
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
    // ✅ FIX: Konsisten pakai FULL_ACCESS_ROLES, bukan hanya ADMIN
    if (!user || !FULL_ACCESS_ROLES.includes(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get("user_id");
    const schedule_date = searchParams.get("schedule_date");

    if (!user_id || !schedule_date) {
      return NextResponse.json({ success: false, message: "user_id dan schedule_date wajib" }, { status: 400 });
    }

    const { error } = await supabase
      .from("user_date_schedule")
      .delete()
      .eq("user_id", user_id)
      .eq("schedule_date", schedule_date);

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}