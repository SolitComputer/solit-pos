// src/app/api/attendance/leave/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Helper: hitung saldo cuti untuk user bulan tertentu ──────────────────────
// Logic: saldo = carry_over + quota - used
// Carry-over = sisa bulan sebelumnya (max 12 bulan ke belakang)
async function ensureLeaveBalance(userId: string, year: number, month: number) {
  // Cek apakah sudah ada record bulan ini
  const { data: existing } = await supabase
    .from("user_leave_balance")
    .select("*")
    .eq("user_id", userId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (existing) return existing;

  // Hitung carry-over dari bulan sebelumnya
  let carryOver = 0;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;

  const { data: prevBalance } = await supabase
    .from("user_leave_balance")
    .select("quota, used, carried_over")
    .eq("user_id", userId)
    .eq("year", prevYear)
    .eq("month", prevMonth)
    .maybeSingle();

  if (prevBalance) {
    const prevRemaining = prevBalance.quota + prevBalance.carried_over - prevBalance.used;
    carryOver = Math.max(0, prevRemaining);
  }

  // Insert record baru
  const { data: newRecord, error } = await supabase
    .from("user_leave_balance")
    .insert({
      user_id: userId,
      year,
      month,
      quota: 1, // 1 hari cuti per bulan default
      used: 0,
      carried_over: carryOver,
    })
    .select()
    .single();

  if (error) throw error;
  return newRecord;
}

// GET — ambil saldo cuti + pengajuan cuti
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year         = parseInt(searchParams.get("year")  || String(new Date().getFullYear()));
    const month        = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const targetUserId = searchParams.get("user_id");

    // Tentukan user ID yang akan dicek
    const checkUserId = user.role === "ADMIN" && targetUserId ? targetUserId : user.id;

    // Jika admin dan tidak ada targetUserId → ambil semua user
    if (user.role === "ADMIN" && !targetUserId) {
      // Ambil semua user
      const { data: allUsers } = await supabase
        .from("users")
        .select("id, name, role")
        .order("name");

      const balances = await Promise.all(
        (allUsers || []).map(async (u: any) => {
          const balance = await ensureLeaveBalance(u.id, year, month);

          // Ambil pengajuan cuti bulan ini
          const paddedMonth = String(month).padStart(2, "0");
          const { data: requests } = await supabase
            .from("user_leave_requests")
            .select("id, leave_date, reason, status, created_at")
            .eq("user_id", u.id)
            .gte("leave_date", `${year}-${paddedMonth}-01`)
            .lte("leave_date", `${year}-${paddedMonth}-${new Date(year, month, 0).getDate().toString().padStart(2, "0")}`)
            .order("leave_date");

          return {
            user: u,
            balance,
            requests: requests || [],
            available: balance.quota + balance.carried_over - balance.used,
          };
        })
      );

      return NextResponse.json({ success: true, data: balances });
    }

    // Ambil saldo + pengajuan untuk user tertentu
    const balance = await ensureLeaveBalance(checkUserId, year, month);

    const paddedMonth = String(month).padStart(2, "0");
    const { data: requests } = await supabase
      .from("user_leave_requests")
      .select("id, leave_date, reason, status, created_at")
      .eq("user_id", checkUserId)
      .gte("leave_date", `${year}-${paddedMonth}-01`)
      .lte("leave_date", `${year}-${paddedMonth}-${new Date(year, month, 0).getDate().toString().padStart(2, "0")}`)
      .order("leave_date");

    // Ambil juga history per bulan (untuk lihat akumulasi)
    const { data: history } = await supabase
      .from("user_leave_balance")
      .select("year, month, quota, used, carried_over")
      .eq("user_id", checkUserId)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(12);

    return NextResponse.json({
      success: true,
      data: {
        balance,
        requests: requests || [],
        history: history || [],
        available: balance.quota + balance.carried_over - balance.used,
      },
    });
  } catch (err: any) {
    console.error("[leave GET]", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// POST — ajukan cuti (admin atau self)
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const body = await request.json();
    const { user_id, leave_date, reason } = body;

    // Admin bisa ajukan untuk siapa saja, user biasa hanya untuk diri sendiri
    const targetUserId = user.role === "ADMIN" ? (user_id || user.id) : user.id;

    if (!leave_date) {
      return NextResponse.json(
        { success: false, message: "leave_date wajib" },
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(leave_date)) {
      return NextResponse.json(
        { success: false, message: "Format: YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const leaveYear  = parseInt(leave_date.slice(0, 4));
    const leaveMonth = parseInt(leave_date.slice(5, 7));

    // Pastikan ada record saldo
    const balance = await ensureLeaveBalance(targetUserId, leaveYear, leaveMonth);
    const available = balance.quota + balance.carried_over - balance.used;

    if (available <= 0) {
      return NextResponse.json(
        { success: false, message: `Saldo cuti tidak cukup. Tersisa: ${available} hari` },
        { status: 400 }
      );
    }

    // Cek duplikat
    const { data: existing } = await supabase
      .from("user_leave_requests")
      .select("id")
      .eq("user_id", targetUserId)
      .eq("leave_date", leave_date)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { success: false, message: "Sudah ada pengajuan cuti untuk tanggal ini" },
        { status: 409 }
      );
    }

    // Insert pengajuan cuti
    const { data: leaveRequest, error: leaveError } = await supabase
      .from("user_leave_requests")
      .insert({
        user_id: targetUserId,
        leave_date,
        reason: reason || null,
        status: "APPROVED",
        approved_by: user.id,
      })
      .select()
      .single();

    if (leaveError) {
      return NextResponse.json({ success: false, message: leaveError.message }, { status: 500 });
    }

    // Update saldo (increment used)
    const { error: balanceError } = await supabase
      .from("user_leave_balance")
      .update({
        used: balance.used + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", balance.id);

    if (balanceError) {
      // Rollback leave request
      await supabase.from("user_leave_requests").delete().eq("id", leaveRequest.id);
      return NextResponse.json({ success: false, message: balanceError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: leaveRequest });
  } catch (err: any) {
    console.error("[leave POST]", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// DELETE — batalkan cuti (kembalikan saldo)
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Hanya admin" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const leaveId = searchParams.get("id");

    if (!leaveId) {
      return NextResponse.json({ success: false, message: "id wajib" }, { status: 400 });
    }

    // Ambil data cuti dulu
    const { data: leaveReq, error: fetchError } = await supabase
      .from("user_leave_requests")
      .select("user_id, leave_date")
      .eq("id", leaveId)
      .single();

    if (fetchError || !leaveReq) {
      return NextResponse.json({ success: false, message: "Data cuti tidak ditemukan" }, { status: 404 });
    }

    const leaveYear  = parseInt(leaveReq.leave_date.slice(0, 4));
    const leaveMonth = parseInt(leaveReq.leave_date.slice(5, 7));

    // Hapus pengajuan
    const { error: deleteError } = await supabase
      .from("user_leave_requests")
      .delete()
      .eq("id", leaveId);

    if (deleteError) {
      return NextResponse.json({ success: false, message: deleteError.message }, { status: 500 });
    }

    // Kembalikan saldo
    const { data: balance } = await supabase
      .from("user_leave_balance")
      .select("id, used")
      .eq("user_id", leaveReq.user_id)
      .eq("year", leaveYear)
      .eq("month", leaveMonth)
      .maybeSingle();

    if (balance && balance.used > 0) {
      await supabase
        .from("user_leave_balance")
        .update({ used: balance.used - 1, updated_at: new Date().toISOString() })
        .eq("id", balance.id);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}