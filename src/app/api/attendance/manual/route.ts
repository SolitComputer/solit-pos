import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { getAttendanceScope } from "@/lib/attendanceScope"; // ✅ NEW

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

// ✅ NEW — dipakai untuk hitung batas akhir "hari absensi" (cutoff jam 04:00 WIB)
function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year") ?? new Date().getFullYear().toString();
    const month = searchParams.get("month") ?? String(new Date().getMonth() + 1);

    const paddedMonth = String(month).padStart(2, "0");
    const startDate = `${year}-${paddedMonth}-01`;
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const endDate = `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`;

    let q = supabase
      .from("attendance_manual")
      .select("id, user_id, attendance_date, check_in_time, status, notes, created_by, created_at")
      .gte("attendance_date", startDate)
      .lte("attendance_date", endDate)
      .order("attendance_date", { ascending: false });

    const scope = await getAttendanceScope(supabase, user);
    if (!scope.all) {
      q = q.in("user_id", scope.visibleIds);
    }

    const { data: manualData, error: manualError } = await q;

    if (manualError) {
      console.error("[attendance/manual GET] error:", manualError);
      return NextResponse.json({ success: false, message: manualError.message }, { status: 500 });
    }

    if (!manualData || manualData.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Ambil user info (employees)
    const userIds = [...new Set(manualData.map((r: any) => r.user_id))];
    const { data: usersData } = await supabase
      .from("users")
      .select("id, name, role, shift")
      .in("id", userIds);

    const usersMap: Record<string, any> = {};
    (usersData || []).forEach((u: any) => { usersMap[u.id] = u; });

    // Ambil nama admin/creator yang mengabsenkan
    const creatorIds = [...new Set(
      manualData.map((r: any) => r.created_by).filter(Boolean)
    )];
    let creatorsMap: Record<string, string> = {};
    if (creatorIds.length > 0) {
      const { data: creatorsData } = await supabase
        .from("users")
        .select("id, name")
        .in("id", creatorIds);
      (creatorsData || []).forEach((u: any) => { creatorsMap[u.id] = u.name; });
    }

    const result = manualData.map((r: any) => ({
      ...r,
      users: usersMap[r.user_id] ?? null,
      created_by_name: r.created_by ? (creatorsMap[r.created_by] ?? null) : null,
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

    if (status === "PRESENT" || status === "LATE") {
      try {
        // ✅ FIX: batas hari absensi jam 04:00 WIB (konsisten sama route lain),
        // dan WAJIB filter direction "IN" — sebelumnya tanpa filter ini, jadi
        // absen PULANG (OUT) yang sudah ada di hari yang sama ikut kehapus
        // setiap kali admin edit/koreksi absen MASUK lewat modal manual.
        const dateStart = `${attendance_date}T04:00:00+07:00`;
        const dateEnd = `${addDaysToDateStr(attendance_date, 1)}T03:59:59+07:00`;

        const { data: deleted, error: deleteError } = await supabase
          .from("face_verifications")
          .delete()
          .eq("user_id", user_id)
          .eq("direction", "IN")
          .gte("created_at", dateStart)
          .lte("created_at", dateEnd)
          .select();

        if (deleteError) {
          console.error("[attendance/manual POST] Failed to delete:", deleteError);
        } else {
          console.log(`[attendance/manual POST] Deleted ${deleted?.length ?? 0} face records`);
        }
      } catch (deleteErr: any) {
        console.error("[attendance/manual POST] Exception:", deleteErr);
      }
    }

    if (status === "LEAVE") {
      try {
        await handleLeaveSync(user_id, attendance_date, notes ?? null);
      } catch (leaveErr: any) {
        console.error("[attendance/manual POST] leave sync error:", leaveErr);
      }
    } else {
      try {
        await cleanupLeaveOnStatusChange(user_id, attendance_date);
      } catch (cleanupErr: any) {
        console.error("[attendance/manual POST] leave cleanup error:", cleanupErr);
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[attendance/manual POST] Exception:", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Unknown error" }, { status: 500 });
  }
}

async function handleLeaveSync(userId: string, leaveDate: string, notes: string | null) {
  const [yearStr, monthStr] = leaveDate.split("-");
  const leaveYear = parseInt(yearStr);
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
      user_id: userId,
      leave_date: leaveDate,
      reason: notes ?? "Cuti (input manual oleh admin)",
      status: "APPROVED",
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

async function cleanupLeaveOnStatusChange(userId: string, leaveDate: string) {
  const { data: leaveReq } = await supabase
    .from("user_leave_requests")
    .select("id")
    .eq("user_id", userId)
    .eq("leave_date", leaveDate)
    .maybeSingle();

  if (!leaveReq) return;

  await supabase.from("user_leave_requests").delete().eq("id", leaveReq.id);

  const [yearStr, monthStr] = leaveDate.split("-");
  const { data: balance } = await supabase
    .from("user_leave_balance")
    .select("id, used")
    .eq("user_id", userId)
    .eq("year", parseInt(yearStr))
    .eq("month", parseInt(monthStr))
    .maybeSingle();

  if (balance && balance.used > 0) {
    await supabase
      .from("user_leave_balance")
      .update({ used: balance.used - 1, updated_at: new Date().toISOString() })
      .eq("id", balance.id);
  }
}

// DELETE — hapus manual attendance (full access only)
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !FULL_ACCESS_ROLES.includes(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get("user_id");
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