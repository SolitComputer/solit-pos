// src/app/api/attendance/manual/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ✅ Full access roles — sama dengan FULL_ACCESS di permissions.ts
const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

// GET — ambil semua manual attendance bulan tertentu
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year  = searchParams.get("year")  ?? new Date().getFullYear().toString();
    const month = searchParams.get("month") ?? String(new Date().getMonth() + 1);

    const paddedMonth = String(month).padStart(2, "0");
    const startDate   = `${year}-${paddedMonth}-01`;
    const lastDay     = new Date(Number(year), Number(month), 0).getDate();
    const endDate     = `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`;

    // Ambil attendance_manual tanpa JOIN FK
    let q = supabase
      .from("attendance_manual")
      .select("id, user_id, attendance_date, check_in_time, status, notes, created_by, created_at")
      .gte("attendance_date", startDate)
      .lte("attendance_date", endDate)
      .order("attendance_date", { ascending: false });

    // Non-admin hanya lihat miliknya sendiri
    if (!FULL_ACCESS_ROLES.includes(user.role)) {
      q = q.eq("user_id", user.id);
    }

    const { data: manualData, error: manualError } = await q;

    if (manualError) {
      console.error("[attendance/manual GET] error:", manualError);
      return NextResponse.json({ success: false, message: manualError.message }, { status: 500 });
    }

    if (!manualData || manualData.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Ambil user info untuk semua user_id yang ada
    const userIds = [...new Set(manualData.map((r: any) => r.user_id))];
    const { data: usersData } = await supabase
      .from("users")
      .select("id, name, role, shift")
      .in("id", userIds);

    const usersMap: Record<string, any> = {};
    (usersData || []).forEach((u: any) => { usersMap[u.id] = u; });

    const result = manualData.map((r: any) => ({
      ...r,
      users: usersMap[r.user_id] ?? null,
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error("[attendance/manual GET] Exception:", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Unknown error" }, { status: 500 });
  }
}

// POST — upsert manual attendance (full access only)
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    // ✅ FIX: ADMIN, PROGRAMMER, ASISTEN_CEO boleh input manual
    if (!user || !FULL_ACCESS_ROLES.includes(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const body = await request.json();
    const { user_id, attendance_date, check_in_time, status, notes } = body;

    if (!user_id || !attendance_date || !status) {
      return NextResponse.json(
        { success: false, message: "user_id, attendance_date, status wajib" },
        { status: 400 }
      );
    }

    const validStatuses = ["PRESENT", "LATE", "SICK", "PERMIT", "ABSENT", "LEAVE"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, message: `Status tidak valid: ${status}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("attendance_manual")
      .upsert(
        {
          user_id,
          attendance_date,
          check_in_time: check_in_time ?? new Date().toISOString(),
          status,
          notes: notes ?? null,
          created_by: user.id,
        },
        { onConflict: "user_id,attendance_date" }
      )
      .select()
      .single();

    if (error) {
      console.error("[attendance/manual POST] upsert error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    // Jika LEAVE → sync ke user_leave_requests
    if (status === "LEAVE") {
      try {
        await handleLeaveSync(user_id, attendance_date, notes ?? null);
      } catch (leaveErr: any) {
        console.error("[attendance/manual POST] leave sync error:", leaveErr);
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[attendance/manual POST] Exception:", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Unknown error" }, { status: 500 });
  }
}

// Helper: sync LEAVE ke user_leave_requests + update balance
async function handleLeaveSync(userId: string, leaveDate: string, notes: string | null) {
  const [yearStr, monthStr] = leaveDate.split("-");
  const leaveYear  = parseInt(yearStr);
  const leaveMonth = parseInt(monthStr);

  const { data: existing } = await supabase
    .from("user_leave_requests")
    .select("id")
    .eq("user_id", userId)
    .eq("leave_date", leaveDate)
    .maybeSingle();

  if (existing) return;

  const { data: balance } = await supabase
    .from("user_leave_balance")
    .select("id, quota, used, carried_over")
    .eq("user_id", userId)
    .eq("year", leaveYear)
    .eq("month", leaveMonth)
    .maybeSingle();

  const { error: leaveError } = await supabase
    .from("user_leave_requests")
    .insert({
      user_id:    userId,
      leave_date: leaveDate,
      reason:     notes ?? "Cuti (input manual oleh admin)",
      status:     "APPROVED",
    });

  if (leaveError) throw new Error(leaveError.message);

  if (balance) {
    await supabase.from("user_leave_balance").update({ used: balance.used + 1 }).eq("id", balance.id);
  } else {
    await supabase.from("user_leave_balance").insert({
      user_id: userId, year: leaveYear, month: leaveMonth,
      quota: 1, used: 1, carried_over: 0,
    });
  }
}

// DELETE — hapus manual attendance (full access only)
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    // ✅ FIX: ADMIN, PROGRAMMER, ASISTEN_CEO boleh hapus
    if (!user || !FULL_ACCESS_ROLES.includes(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const user_id         = searchParams.get("user_id");
    const attendance_date = searchParams.get("attendance_date");

    if (!user_id || !attendance_date) {
      return NextResponse.json({ success: false, message: "user_id dan attendance_date wajib" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("attendance_manual")
      .select("id, status")
      .eq("user_id", user_id)
      .eq("attendance_date", attendance_date)
      .maybeSingle();

    if (existing?.status === "LEAVE") {
      try {
        const { data: leaveReq } = await supabase
          .from("user_leave_requests")
          .select("id")
          .eq("user_id", user_id)
          .eq("leave_date", attendance_date)
          .maybeSingle();

        if (leaveReq) {
          await supabase.from("user_leave_requests").delete().eq("id", leaveReq.id);

          const [y, m] = attendance_date.split("-");
          const { data: balance } = await supabase
            .from("user_leave_balance")
            .select("id, used")
            .eq("user_id", user_id)
            .eq("year", parseInt(y))
            .eq("month", parseInt(m))
            .maybeSingle();

          if (balance && balance.used > 0) {
            await supabase.from("user_leave_balance").update({ used: balance.used - 1 }).eq("id", balance.id);
          }
        }
      } catch (e: any) {
        console.error("[attendance/manual DELETE] leave cleanup error:", e);
      }
    }

    const { error } = await supabase
      .from("attendance_manual")
      .delete()
      .eq("user_id", user_id)
      .eq("attendance_date", attendance_date);

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[attendance/manual DELETE] Exception:", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Unknown error" }, { status: 500 });
  }
}