import { NextResponse } from "next/server";
import { getCurrentUser, isFullAccess } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);


async function ensureLeaveBalance(userId: string, year: number, month: number) {
  // ── 1. Ambil SEMUA record balance user ini, urut kronologis ──
  const { data: allRecs } = await supabase
    .from("user_leave_balance")
    .select("*")
    .eq("user_id", userId)
    .order("year", { ascending: true })
    .order("month", { ascending: true });

  const records = allRecs || [];

  // ── 2. Forward-pass: hitung ulang carried_over dari record pertama ──
  //    Ini memperbaiki chain yang basi karena cuti ditambah/dihapus
  //    di bulan sebelumnya SETELAH record sudah terlanjur dibuat.
  let prevRemaining = 0;
  let prevYear = 0;
  let prevMonth = 0;

  for (const rec of records) {
    // Gap months (bulan tanpa record) dianggap quota=1, used=0
    if (prevYear > 0) {
      const gapMonths = (rec.year - prevYear) * 12 + (rec.month - prevMonth) - 1;
      if (gapMonths > 0) prevRemaining += gapMonths;
    }

    const correctCO = prevRemaining;

    // Update di DB kalau ternyata basi
    if (rec.carried_over !== correctCO) {
      await supabase
        .from("user_leave_balance")
        .update({ carried_over: correctCO, updated_at: new Date().toISOString() })
        .eq("id", rec.id);
      rec.carried_over = correctCO;
    }

    prevRemaining = Math.max(0, rec.quota + correctCO - rec.used);
    prevYear = rec.year;
    prevMonth = rec.month;
  }

  // ── 3. Cek apakah bulan target sudah ada ──
  const existing = records.find(r => r.year === year && r.month === month);
  if (existing) return existing;

  // ── 4. Belum ada → hitung gap dari record terakhir, buat baru ──
  if (prevYear > 0) {
    const gapMonths = (year - prevYear) * 12 + (month - prevMonth) - 1;
    if (gapMonths > 0) prevRemaining += gapMonths;
  }

  const { data: newRecord, error } = await supabase
    .from("user_leave_balance")
    .insert({
      user_id: userId,
      year,
      month,
      quota: 1,
      used: 0,
      carried_over: prevRemaining,
    })
    .select()
    .single();

  if (error) throw error;
  return newRecord;
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const targetUserId = searchParams.get("user_id");

    const checkUserId = isFullAccess(user.role) && targetUserId ? targetUserId : user.id;

    if (isFullAccess(user.role) && !targetUserId) {
      const { data: allUsers } = await supabase
        .from("users")
        .select("id, name, role")
        .is("deleted_at", null)   // ← TAMBAH: skip user arsip (Ex Karyawan/PKL)
        .order("name");

      const balances = await Promise.all(
        (allUsers || []).map(async (u: any) => {
          const balance = await ensureLeaveBalance(u.id, year, month);

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

    const balance = await ensureLeaveBalance(checkUserId, year, month);
    const paddedMonth = String(month).padStart(2, "0");
    const { data: requests } = await supabase
      .from("user_leave_requests")
      .select("id, leave_date, reason, status, created_at")
      .eq("user_id", checkUserId)
      .gte("leave_date", `${year}-${paddedMonth}-01`)
      .lte("leave_date", `${year}-${paddedMonth}-${new Date(year, month, 0).getDate().toString().padStart(2, "0")}`)
      .order("leave_date");

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

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const body = await request.json();
    const { user_id, leave_date, reason, action, quota } = body;

    // ✅ NEW: action="set_quota" → admin set saldo manual langsung
    if (action === "set_quota") {
      if (!isFullAccess(user.role)) {
        return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
      }
      if (!user_id || quota === undefined) {
        return NextResponse.json({ success: false, message: "user_id dan quota wajib" }, { status: 400 });
      }

      const year = parseInt(body.year || String(new Date().getFullYear()));
      const month = parseInt(body.month || String(new Date().getMonth() + 1));

      const balance = await ensureLeaveBalance(user_id, year, month);

      const { data, error } = await supabase
        .from("user_leave_balance")
        .update({
          quota: Math.max(0, parseInt(quota)),
          updated_at: new Date().toISOString(),
        })
        .eq("id", balance.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, data });
    }

    // ✅ NEW: action="manual_leave" → dipanggil dari absen manual status LEAVE
    if (action === "manual_leave") {
      if (!isFullAccess(user.role)) {
        return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
      }
      if (!user_id || !leave_date) {
        return NextResponse.json({ success: false, message: "user_id dan leave_date wajib" }, { status: 400 });
      }

      const leaveYear = parseInt(leave_date.slice(0, 4));
      const leaveMonth = parseInt(leave_date.slice(5, 7));

      // Cek duplikat di leave_requests
      const { data: existing } = await supabase
        .from("user_leave_requests")
        .select("id")
        .eq("user_id", user_id)
        .eq("leave_date", leave_date)
        .maybeSingle();

      if (existing) {
        // Sudah ada leave request, tidak perlu buat baru (idempotent)
        return NextResponse.json({ success: true, message: "Sudah ada leave request" });
      }

      // Cek dan kurangi saldo kalau masih ada
      const balance = await ensureLeaveBalance(user_id, leaveYear, leaveMonth);
      const available = balance.quota + balance.carried_over - balance.used;

      // Insert leave request
      const { data: leaveRequest, error: leaveError } = await supabase
        .from("user_leave_requests")
        .insert({
          user_id,
          leave_date,
          reason: reason || "Cuti (input manual admin)",
          status: "APPROVED",
          approved_by: user.id,
        })
        .select()
        .single();

      if (leaveError) {
        return NextResponse.json({ success: false, message: leaveError.message }, { status: 500 });
      }

      // Kurangi saldo jika masih ada (tidak force 0)
      if (available > 0) {
        await supabase
          .from("user_leave_balance")
          .update({ used: balance.used + 1, updated_at: new Date().toISOString() })
          .eq("id", balance.id);
      }

      return NextResponse.json({ success: true, data: leaveRequest });
    }

    // === Default: tambah cuti normal ===
    const targetUserId = isFullAccess(user.role) ? (user_id || user.id) : user.id;

    if (!leave_date) {
      return NextResponse.json({ success: false, message: "leave_date wajib" }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(leave_date)) {
      return NextResponse.json({ success: false, message: "Format: YYYY-MM-DD" }, { status: 400 });
    }

    const leaveYear = parseInt(leave_date.slice(0, 4));
    const leaveMonth = parseInt(leave_date.slice(5, 7));

    const balance = await ensureLeaveBalance(targetUserId, leaveYear, leaveMonth);
    const available = balance.quota + balance.carried_over - balance.used;

    if (available <= 0 && !isFullAccess(user.role)) {
      return NextResponse.json(
        { success: false, message: `Saldo cuti tidak cukup. Tersisa: ${available} hari` },
        { status: 400 }
      );
    }

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

    if (available > 0) {
      const { error: balanceError } = await supabase
        .from("user_leave_balance")
        .update({ used: balance.used + 1, updated_at: new Date().toISOString() })
        .eq("id", balance.id);

      if (balanceError) {
        await supabase.from("user_leave_requests").delete().eq("id", leaveRequest.id);
        return NextResponse.json({ success: false, message: balanceError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, data: leaveRequest });
  } catch (err: any) {
    console.error("[leave POST]", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !isFullAccess(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const leaveId = searchParams.get("id");

    if (!leaveId) {
      return NextResponse.json({ success: false, message: "id wajib" }, { status: 400 });
    }

    const { data: leaveReq, error: fetchError } = await supabase
      .from("user_leave_requests")
      .select("user_id, leave_date")
      .eq("id", leaveId)
      .single();

    if (fetchError || !leaveReq) {
      return NextResponse.json({ success: false, message: "Data cuti tidak ditemukan" }, { status: 404 });
    }

    const leaveYear = parseInt(leaveReq.leave_date.slice(0, 4));
    const leaveMonth = parseInt(leaveReq.leave_date.slice(5, 7));

    const { error: deleteError } = await supabase
      .from("user_leave_requests")
      .delete()
      .eq("id", leaveId);

    if (deleteError) {
      return NextResponse.json({ success: false, message: deleteError.message }, { status: 500 });
    }

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

  // ✅ NEW: PATCH untuk undo manual_leave (hapus dari leave_requests berdasarkan user+date)
}

// ✅ NEW: PATCH — undo manual leave (dipanggil saat absen manual LEAVE dihapus)
export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !isFullAccess(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const body = await request.json();
    const { user_id, leave_date } = body;

    if (!user_id || !leave_date) {
      return NextResponse.json({ success: false, message: "user_id dan leave_date wajib" }, { status: 400 });
    }

    const leaveYear = parseInt(leave_date.slice(0, 4));
    const leaveMonth = parseInt(leave_date.slice(5, 7));

    // Hapus leave request
    const { data: leaveReq } = await supabase
      .from("user_leave_requests")
      .select("id")
      .eq("user_id", user_id)
      .eq("leave_date", leave_date)
      .maybeSingle();

    if (!leaveReq) {
      return NextResponse.json({ success: true, message: "Tidak ada leave request" });
    }

    await supabase.from("user_leave_requests").delete().eq("id", leaveReq.id);

    // Kembalikan saldo
    const { data: balance } = await supabase
      .from("user_leave_balance")
      .select("id, used")
      .eq("user_id", user_id)
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