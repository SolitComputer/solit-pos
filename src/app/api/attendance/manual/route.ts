// src/app/api/attendance/manual/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET — ambil semua manual attendance (admin) atau milik sendiri
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year  = searchParams.get("year");
    const month = searchParams.get("month");

    let q = supabase
      .from("attendance_manual")
      .select(`
        id, user_id, attendance_date, check_in_time, status, notes, created_by, created_at,
        users!attendance_manual_user_id_fkey (id, name, role, shift)
      `)
      .order("attendance_date", { ascending: true });

    if (user.role !== "ADMIN") {
      q = q.eq("user_id", user.id);
    }

    if (year && month) {
      const paddedMonth = String(month).padStart(2, "0");
      const from    = `${year}-${paddedMonth}-01`;
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      const to      = `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`;
      q = q.gte("attendance_date", from).lte("attendance_date", to);
    }

    const { data, error } = await q;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data: data || [] });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// POST — tambah / edit absen manual
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Hanya admin" }, { status: 403 });
    }

    const body = await request.json();
    const { user_id, attendance_date, check_in_time, status = "PRESENT", notes } = body;

    if (!user_id || !attendance_date || !check_in_time) {
      return NextResponse.json(
        { success: false, message: "user_id, attendance_date, check_in_time wajib" },
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(attendance_date)) {
      return NextResponse.json(
        { success: false, message: "Format tanggal: YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const VALID_STATUSES = ["PRESENT", "LATE", "SICK", "PERMIT", "ABSENT"];
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, message: `Status harus salah satu: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("attendance_manual")
      .upsert(
        {
          user_id,
          attendance_date,
          check_in_time,
          status,
          notes: notes || null,
          created_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,attendance_date" }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// DELETE — hapus absen manual
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Hanya admin" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const user_id         = searchParams.get("user_id");
    const attendance_date = searchParams.get("attendance_date");

    if (!user_id || !attendance_date) {
      return NextResponse.json(
        { success: false, message: "user_id dan attendance_date wajib" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("attendance_manual")
      .delete()
      .eq("user_id", user_id)
      .eq("attendance_date", attendance_date);

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}