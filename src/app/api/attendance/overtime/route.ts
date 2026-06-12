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

// ─── GET ──────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year =
      searchParams.get("year") ?? new Date().getFullYear().toString();
    const month =
      searchParams.get("month") ?? String(new Date().getMonth() + 1);
    const status = searchParams.get("status");

    const paddedMonth = String(month).padStart(2, "0");
    const startDate = `${year}-${paddedMonth}-01`;
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const endDate = `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`;

    let q = supabase
      .from("overtime_requests")
      .select(
        `
        id, user_id, request_date, reason, requested_start,
        status, approved_by, approved_at,
        scheduled_start, scheduled_end, actual_start, rate_per_hour,
        rejection_note, actual_end, proof_photo_url,
        completed_at, duration_minutes, total_pay,
        work_description, auto_completed,
        created_at, updated_at
      `
      )
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

// ─── POST ─────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const body = await request.json();
    const {
      request_date,
      reason,
      requested_start,
      // ─── field baru untuk normal request ─────────────────────────────
      work_description: reqWorkDesc,
      // ─── MANUAL fields ───────────────────────────────────────────────
      is_manual,
      target_user_id,
      actual_start_time, // "HH:MM"
      actual_end_time, // "HH:MM"
      work_description,
      proof_photo_url,
      rate_per_hour,
    } = body;

    // ─── MANUAL INPUT ──────────────────────────────────────────────────────
    if (is_manual === true) {
      // Hanya ADMIN, PROGRAMMER, ASISTEN_CEO
      if (!FULL_ACCESS.includes(user.role)) {
        return NextResponse.json(
          { success: false, message: "Tidak berwenang input lembur manual" },
          { status: 403 }
        );
      }

      if (
        !target_user_id ||
        !request_date ||
        !actual_start_time ||
        !actual_end_time
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "target_user_id, request_date, actual_start_time, actual_end_time wajib",
          },
          { status: 400 }
        );
      }

      // Build ISO timestamps dengan timezone WIB +07:00
      const fmt = (t: string) => (t.length === 5 ? `${t}:00` : t);
      const actualStart = `${request_date}T${fmt(actual_start_time)}+07:00`;
      const actualEnd = `${request_date}T${fmt(actual_end_time)}+07:00`;

      // Validasi end > start
      if (new Date(actualEnd).getTime() <= new Date(actualStart).getTime()) {
        return NextResponse.json(
          {
            success: false,
            message: "Jam selesai harus lebih besar dari jam mulai",
          },
          { status: 400 }
        );
      }

      // Hitung durasi dan bayaran
      const durationMins = Math.round(
        (new Date(actualEnd).getTime() - new Date(actualStart).getTime()) /
          60000
      );
      const billedHours = Math.floor(durationMins / 60);

      // Ambil rate dari overtime_rates jika tidak disuplai
      let finalRate = rate_per_hour ?? 0;
      if (!finalRate) {
        const { data: targetUserData } = await supabase
          .from("users")
          .select("role")
          .eq("id", target_user_id)
          .single();

        if (targetUserData?.role) {
          const { data: rateData } = await supabase
            .from("overtime_rates")
            .select("rate_per_hour")
            .eq("role", targetUserData.role)
            .maybeSingle();
          finalRate = rateData?.rate_per_hour ?? 0;
        }
      }

      const totalPay = billedHours * finalRate;

      const { data, error } = await supabase
        .from("overtime_requests")
        .insert({
          user_id: target_user_id,
          request_date,
          reason: reason?.trim() || "Input manual oleh admin",
          requested_start: actual_start_time,
          status: "COMPLETED",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          scheduled_start: actualStart,
          scheduled_end: actualEnd,
          actual_start: actualStart,
          actual_end: actualEnd,
          work_description: work_description?.trim() || null,
          proof_photo_url: proof_photo_url || null,
          rate_per_hour: Math.round(finalRate),
          total_pay: Math.round(totalPay),
          duration_minutes: durationMins,
          completed_at: new Date().toISOString(),
          auto_completed: false,
        })
        .select()
        .single();

      if (error)
        return NextResponse.json(
          { success: false, message: error.message },
          { status: 500 }
        );

      return NextResponse.json({ success: true, data });
    }

    // ─── NORMAL REQUEST ────────────────────────────────────────────────────
    if (!request_date || !reason || !requested_start) {
      return NextResponse.json(
        {
          success: false,
          message: "request_date, reason, requested_start wajib",
        },
        { status: 400 }
      );
    }

    // Validasi work_description wajib untuk normal request
    if (!reqWorkDesc?.trim()) {
      return NextResponse.json(
        {
          success: false,
          message: "Rincian pekerjaan wajib diisi",
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
        reason,                              // label opsi atau teks custom "Lainnya"
        work_description: reqWorkDesc.trim(), // rincian pekerjaan dari user
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

// ─── PATCH ────────────────────────────────────────────────────────────────
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

    console.log(
      "[PATCH] Action:",
      action,
      "User:",
      user.id,
      "UserRole:",
      user.role
    );
    console.log(
      "[PATCH] Overtime user_id:",
      overtime.user_id,
      "Status:",
      overtime.status
    );

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

      // Pastikan request masih PENDING
      if (overtime.status !== "PENDING") {
        return NextResponse.json(
          {
            success: false,
            message: "Hanya request berstatus PENDING yang bisa disetujui",
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

      // ✅ Langsung set ONGOING + actual_start saat approve
      // Tidak perlu step "Mulai" lagi dari sisi karyawan
      const { data, error } = await supabase
        .from("overtime_requests")
        .update({
          status: "ONGOING",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          scheduled_start,
          scheduled_end,
          rate_per_hour: finalRate,
          actual_start: new Date().toISOString(),
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

    // ─── COMPLETE ─────────────────────────────────────────────────────────
    if (action === "COMPLETE") {
      if (overtime.user_id !== user.id) {
        console.log(
          "[COMPLETE] Unauthorized: overtime.user_id:",
          overtime.user_id,
          "user.id:",
          user.id
        );
        return NextResponse.json(
          { success: false, message: "Bukan request milikmu" },
          { status: 403 }
        );
      }

      // Boleh complete jika ONGOING, atau COMPLETED tapi belum ada foto bukti
      if (
        !["APPROVED", "ONGOING"].includes(overtime.status) &&
        !(overtime.status === "COMPLETED" && !overtime.proof_photo_url)
      ) {
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

      // Hanya boleh SET_PAY jika sudah COMPLETED
      if (overtime.status !== "COMPLETED") {
        return NextResponse.json(
          {
            success: false,
            message:
              "Bayaran hanya bisa diatur setelah lembur selesai (COMPLETED)",
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