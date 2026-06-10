// src/app/api/attendance/overtime/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DIVISION_HEAD_MAP: Record<string, string[]> = {
  KEPALA_SALES: ["CREW_SALES", "SOTECH", "PENGANTARAN", "KEPALA_SALES"],
  KEPALA_MARKETING: ["MARKETING", "KEPALA_MARKETING"],
  KEPALA_TEKNISI: ["TEKNISI", "KEPALA_TEKNISI"],
};
const FULL_ACCESS = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

function canApprove(approverRole: string, targetRole: string): boolean {
  if (FULL_ACCESS.includes(approverRole)) return true;
  return DIVISION_HEAD_MAP[approverRole]?.includes(targetRole) ?? false;
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year") ?? new Date().getFullYear().toString();
    const month = searchParams.get("month") ?? String(new Date().getMonth() + 1);
    const status = searchParams.get("status");

    const paddedMonth = String(month).padStart(2, "0");
    const startDate = `${year}-${paddedMonth}-01`;
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const endDate = `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`;

    let q = supabase
      .from("overtime_requests")
      .select(`
        id, user_id, request_date, reason, requested_start,
        status, approved_by, approved_at,
        scheduled_start, scheduled_end, actual_start, rate_per_hour,
        rejection_note, actual_end, proof_photo_url,
        completed_at, duration_minutes, total_pay,
        work_description, auto_completed,
        created_at, updated_at
      `)
      .gte("request_date", startDate)
      .lte("request_date", endDate)
      .order("created_at", { ascending: false });

    if (status) q = q.eq("status", status);

    const isAdmin =
      FULL_ACCESS.includes(user.role) ||
      Object.keys(DIVISION_HEAD_MAP).includes(user.role);
    if (!isAdmin) q = q.eq("user_id", user.id);

    const { data: overtimes, error } = await q;
    if (error)
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );

    if (!overtimes || overtimes.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // ✅ Get user data for all overtime requests
    const userIds = [
      ...new Set([
        ...overtimes.map((o: any) => o.user_id),
        ...overtimes
          .filter((o: any) => o.approved_by)
          .map((o: any) => o.approved_by),
      ]),
    ].filter(Boolean);

    const { data: usersData } = await supabase
      .from("users")
      .select("id, name, role, shift")
      .in("id", userIds);

    const usersMap: Record<string, any> = {};
    (usersData || []).forEach((u: any) => {
      usersMap[u.id] = u;
    });

    // ✅ Map with proper 'users' key
    const result = overtimes.map((o: any) => ({
      ...o,
      users: usersMap[o.user_id] ?? null,
      approver: o.approved_by ? usersMap[o.approved_by] ?? null : null,
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const body = await request.json();
    const { request_date, reason, requested_start } = body;

    if (!request_date || !reason || !requested_start) {
      return NextResponse.json(
        {
          success: false,
          message: "request_date, reason, requested_start wajib",
        },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from("overtime_requests")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("request_date", request_date)
      .in("status", ["PENDING", "APPROVED", "ONGOING"])
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          message: "Sudah ada request lembur aktif untuk tanggal ini",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("overtime_requests")
      .insert({
        user_id: user.id,
        request_date,
        reason,
        requested_start,
        status: "PENDING",
      })
      .select()
      .single();

    if (error)
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ success: false }, { status: 401 });

    const body = await request.json();
    const {
      id,
      action,
      scheduled_start,
      scheduled_end,
      rate_per_hour,
      rejection_note,
      proof_photo_url,
      total_pay,
      work_description,
      auto_completed,
    } = body;

    if (!id || !action) {
      return NextResponse.json(
        { success: false, message: "id dan action wajib" },
        { status: 400 }
      );
    }

    const { data: overtime, error: findError } = await supabase
      .from("overtime_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (findError || !overtime)
      return NextResponse.json(
        { success: false, message: "Request tidak ditemukan" },
        { status: 404 }
      );

    const { data: targetUser } = await supabase
      .from("users")
      .select("role")
      .eq("id", overtime.user_id)
      .single();

    console.log("[PATCH] Action:", action, "User:", user.id, "UserRole:", user.role);
    console.log("[PATCH] Overtime user_id:", overtime.user_id, "Status:", overtime.status);

    // ─── APPROVE ──────────────────────────────────────────────────────────
    if (action === "APPROVE") {
      if (!canApprove(user.role, targetUser?.role ?? "")) {
        return NextResponse.json(
          { success: false, message: "Tidak berwenang menyetujui" },
          { status: 403 }
        );
      }
      if (!scheduled_start || !scheduled_end) {
        return NextResponse.json(
          {
            success: false,
            message: "scheduled_start dan scheduled_end wajib saat approve",
          },
          { status: 400 }
        );
      }

      let finalRate = rate_per_hour;
      if (!finalRate) {
        const { data: rateData } = await supabase
          .from("overtime_rates")
          .select("rate_per_hour")
          .eq("role", targetUser?.role ?? "")
          .maybeSingle();
        finalRate = rateData?.rate_per_hour ?? 0;
      }

      const { data, error } = await supabase
        .from("overtime_requests")
        .update({
          status: "APPROVED",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          scheduled_start,
          scheduled_end,
          rate_per_hour: finalRate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error)
        return NextResponse.json(
          { success: false, message: error.message },
          { status: 500 }
        );
      return NextResponse.json({ success: true, data });
    }

    // ─── REJECT ───────────────────────────────────────────────────────────
    if (action === "REJECT") {
      if (!canApprove(user.role, targetUser?.role ?? "")) {
        return NextResponse.json(
          { success: false, message: "Tidak berwenang menolak" },
          { status: 403 }
        );
      }

      const { data, error } = await supabase
        .from("overtime_requests")
        .update({
          status: "REJECTED",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          rejection_note: rejection_note ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error)
        return NextResponse.json(
          { success: false, message: error.message },
          { status: 500 }
        );
      return NextResponse.json({ success: true, data });
    }

    // ─── START ────────────────────────────────────────────────────────────
    if (action === "START") {
      if (overtime.user_id !== user.id) {
        return NextResponse.json(
          { success: false, message: "Bukan request milikmu" },
          { status: 403 }
        );
      }
      if (overtime.status !== "APPROVED") {
        return NextResponse.json(
          { success: false, message: "Request belum disetujui" },
          { status: 400 }
        );
      }

      // ✅ Validasi uraian pekerjaan wajib diisi
      if (!work_description?.trim()) {
        return NextResponse.json(
          {
            success: false,
            message: "Uraian pekerjaan wajib diisi sebelum memulai lembur",
          },
          { status: 400 }
        );
      }

      // Validasi waktu: hanya bisa mulai saat sudah >= scheduled_start
      if (overtime.scheduled_start) {
        const nowMs = Date.now();
        const scheduledMs = new Date(overtime.scheduled_start).getTime();
        if (nowMs < scheduledMs) {
          const diffMins = Math.ceil((scheduledMs - nowMs) / 60000);
          return NextResponse.json(
            {
              success: false,
              message: `Belum waktunya mulai. Lembur dijadwalkan mulai pukul ${new Date(overtime.scheduled_start).toLocaleTimeString(
                "id-ID",
                {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Jakarta",
                }
              )} WIB (${diffMins} menit lagi)`,
              notYetTime: true,
              scheduledStart: overtime.scheduled_start,
            },
            { status: 400 }
          );
        }
      }

      const actualStartNow = new Date().toISOString();
      const { data, error } = await supabase
        .from("overtime_requests")
        .update({
          status: "ONGOING",
          actual_start: actualStartNow,
          work_description: work_description.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error)
        return NextResponse.json(
          { success: false, message: error.message },
          { status: 500 }
        );
      return NextResponse.json({ success: true, data });
    }

    // ─── COMPLETE ─────────────────────────────────────────────────────────
    if (action === "COMPLETE") {
      if (overtime.user_id !== user.id) {
        console.log("[COMPLETE] Unauthorized: overtime.user_id:", overtime.user_id, "user.id:", user.id);
        return NextResponse.json(
          { success: false, message: "Bukan request milikmu" },
          { status: 403 }
        );
      }
      if (!["APPROVED", "ONGOING"].includes(overtime.status)) {
        return NextResponse.json(
          { success: false, message: "Status tidak valid untuk complete" },
          { status: 400 }
        );
      }

      const actualEnd = new Date().toISOString();
      const startReference = overtime.actual_start ?? overtime.scheduled_start;
      const durationMins = startReference
        ? Math.round(
            (new Date(actualEnd).getTime() -
              new Date(startReference).getTime()) /
              60000
          )
        : 0;
      const ratePerHour = overtime.rate_per_hour ?? 0;
      const billedHours = Math.floor(durationMins / 60);
      const calculatedPay = billedHours * ratePerHour;

      const updates: any = {
        actual_end: actualEnd,
        status: "COMPLETED",
        proof_photo_url: proof_photo_url ?? null,
        completed_at: actualEnd,
        duration_minutes: durationMins,
        total_pay: calculatedPay,
        updated_at: new Date().toISOString(),
      };

      // ✅ Add auto_completed flag if provided
      if (auto_completed === true) {
        updates.auto_completed = true;
      }

      const { data, error } = await supabase
        .from("overtime_requests")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error)
        return NextResponse.json(
          { success: false, message: error.message },
          { status: 500 }
        );
      return NextResponse.json({ success: true, data });
    }

    // ─── SET_PAY ──────────────────────────────────────────────────────────
    if (action === "SET_PAY") {
      if (!canApprove(user.role, targetUser?.role ?? "")) {
        return NextResponse.json(
          { success: false, message: "Tidak berwenang mengubah total bayar" },
          { status: 403 }
        );
      }
      if (overtime.status !== "ONGOING") {
        return NextResponse.json(
          {
            success: false,
            message: "Hanya untuk lembur yang sedang berjalan",
          },
          { status: 400 }
        );
      }

      if (!rate_per_hour || rate_per_hour < 0) {
        return NextResponse.json(
          { success: false, message: "rate_per_hour wajib diisi" },
          { status: 400 }
        );
      }

      const updatePayload: any = {
        rate_per_hour: Math.round(rate_per_hour),
        total_pay: Math.round(total_pay),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("overtime_requests")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

      if (error)
        return NextResponse.json(
          { success: false, message: error.message },
          { status: 500 }
        );
      return NextResponse.json({ success: true, data });
    }

    // ─── CANCEL ───────────────────────────────────────────────────────────
    if (action === "CANCEL") {
      const isOwner = overtime.user_id === user.id;
      const isAdmin =
        FULL_ACCESS.includes(user.role) ||
        canApprove(user.role, targetUser?.role ?? "");
      if (!isOwner && !isAdmin) {
        return NextResponse.json(
          { success: false, message: "Tidak berwenang" },
          { status: 403 }
        );
      }

      const { data, error } = await supabase
        .from("overtime_requests")
        .update({
          status: "CANCELLED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error)
        return NextResponse.json(
          { success: false, message: error.message },
          { status: 500 }
        );
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json(
      { success: false, message: `Action tidak dikenal: ${action}` },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("[PATCH Error]", err);
    return NextResponse.json(
      { success: false, message: err?.message },
      { status: 500 }
    );
  }
}