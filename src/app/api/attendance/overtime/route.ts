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

// ✅ Role yang boleh melihat data bayaran lembur (rate_per_hour & total_pay)
const PAY_VIEW_ROLES = [
  "KEPALA_SALES",
  "KEPALA_MARKETING",
  "KEPALA_TEKNISI",
  "KEPALA_PENYEDIA_BARANG",
  "ADMIN",
  "PROGRAMMER",
  "ASISTEN_CEO",
  "KEPALA_ONPOINT",
  "KEPALA_SOTECH",
];

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
    const year = searchParams.get("year") ?? new Date().getFullYear().toString();
    const month = searchParams.get("month") ?? String(new Date().getMonth() + 1);
    const status = searchParams.get("status");

    const paddedMonth = String(month).padStart(2, "0");
    const startDate = `${year}-${paddedMonth}-01`;
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const endDate = `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`;

    // ✅ LEGACY DATA CORRECTION: semua COMPLETED tanpa foto → NEED_PROOF
    // Ini menangani data lama sebelum status NEED_PROOF ada
    await supabase
      .from("overtime_requests")
      .update({ status: "NEED_PROOF", updated_at: new Date().toISOString() })
      .eq("status", "COMPLETED")
      .is("proof_photo_url", null);

    // ✅ SERVER-SIDE AUTO-COMPLETE: cek & selesaikan overtime yang melewati scheduled_end
    // Status → NEED_PROOF (bukan COMPLETED) karena foto belum ada
    const now = new Date().toISOString();
    const { data: expiredOvertimes } = await supabase
      .from("overtime_requests")
      .select("id, user_id, actual_start, scheduled_end, rate_per_hour")
      .eq("status", "ONGOING")
      .not("scheduled_end", "is", null)
      .lt("scheduled_end", now);

    if (expiredOvertimes && expiredOvertimes.length > 0) {
      for (const expired of expiredOvertimes) {
        const actualEnd = expired.scheduled_end;
        const startMs = new Date(expired.actual_start).getTime();
        const endMs = new Date(actualEnd).getTime();
        const durationMins = Math.round((endMs - startMs) / 60000);
        const billedHours = Math.floor(durationMins / 60);
        const ratePerHour = expired.rate_per_hour ?? 0;
        const calculatedPay = billedHours * ratePerHour;

        await supabase
          .from("overtime_requests")
          .update({
            // ✅ NEED_PROOF: waktu habis otomatis, tapi foto belum ada → wajib upload
            status: "NEED_PROOF",
            actual_end: actualEnd,
            completed_at: actualEnd,
            duration_minutes: durationMins,
            total_pay: calculatedPay,
            auto_completed: true,
            updated_at: now,
          })
          .eq("id", expired.id);

        console.log(`[SERVER AUTO-COMPLETE] ${expired.id} → NEED_PROOF, actual_end: ${actualEnd}`);
      }
    }

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

    const userIds = [
      ...new Set([
        ...overtimes.map((o: any) => o.user_id),
        ...overtimes.filter((o: any) => o.approved_by).map((o: any) => o.approved_by),
      ]),
    ].filter(Boolean);

    const { data: usersData } = await supabase
      .from("users")
      .select("id, name, role, shift")
      .in("id", userIds);

    const usersMap: Record<string, any> = {};
    (usersData || []).forEach((u: any) => { usersMap[u.id] = u; });

    const result = overtimes.map((o: any) => ({
      ...o,
      users: usersMap[o.user_id] ?? null,
      approver: o.approved_by ? usersMap[o.approved_by] ?? null : null,
    }));

    // ✅ Strip rate_per_hour & total_pay untuk role yang tidak berwenang melihat bayaran
    const canSeePay = PAY_VIEW_ROLES.includes(user.role);
    const finalResult = canSeePay
      ? result
      : result.map(({ rate_per_hour, total_pay, ...rest }: any) => ({
          ...rest,
          rate_per_hour: null,
          total_pay: null,
        }));

    return NextResponse.json({ success: true, data: finalResult });
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
      work_description: reqWorkDesc,
      is_manual,
      target_user_id,
      actual_start_time,
      actual_end_time,
      work_description,
      proof_photo_url,
      rate_per_hour,
    } = body;

    // ─── MANUAL INPUT ──────────────────────────────────────────────────────
    if (is_manual === true) {
      if (!FULL_ACCESS.includes(user.role)) {
        return NextResponse.json(
          { success: false, message: "Tidak berwenang input lembur manual" },
          { status: 403 }
        );
      }

      if (!target_user_id || !request_date || !actual_start_time || !actual_end_time) {
        return NextResponse.json(
          {
            success: false,
            message: "target_user_id, request_date, actual_start_time, actual_end_time wajib",
          },
          { status: 400 }
        );
      }

      const fmt = (t: string) => (t.length === 5 ? `${t}:00` : t);
      const actualStart = `${request_date}T${fmt(actual_start_time)}+07:00`;
      const actualEnd = `${request_date}T${fmt(actual_end_time)}+07:00`;

      if (new Date(actualEnd).getTime() <= new Date(actualStart).getTime()) {
        return NextResponse.json(
          { success: false, message: "Jam selesai harus lebih besar dari jam mulai" },
          { status: 400 }
        );
      }

      const durationMins = Math.round(
        (new Date(actualEnd).getTime() - new Date(actualStart).getTime()) / 60000
      );
      const billedHours = Math.floor(durationMins / 60);

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
          // ✅ NEED_PROOF jika belum ada foto, COMPLETED jika sudah ada foto
          status: proof_photo_url ? "COMPLETED" : "NEED_PROOF",
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
        { success: false, message: "request_date, reason, requested_start wajib" },
        { status: 400 }
      );
    }

    if (!reqWorkDesc?.trim()) {
      return NextResponse.json(
        { success: false, message: "Rincian pekerjaan wajib diisi" },
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
        { success: false, message: "Sudah ada request lembur aktif untuk tanggal ini" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("overtime_requests")
      .insert({
        user_id: user.id,
        request_date,
        reason,
        work_description: reqWorkDesc.trim(),
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
          { success: false, message: "scheduled_start dan scheduled_end wajib saat approve" },
          { status: 400 }
        );
      }

      if (overtime.status !== "PENDING") {
        return NextResponse.json(
          { success: false, message: "Hanya request berstatus PENDING yang bisa disetujui" },
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
          status: "ONGOING",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          scheduled_start,
          scheduled_end,
          rate_per_hour: finalRate,
          actual_start: scheduled_start,
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
        return NextResponse.json(
          { success: false, message: "Bukan request milikmu" },
          { status: 403 }
        );
      }

      // ✅ Kasus 1: Upload foto untuk overtime yang sudah COMPLETED atau NEED_PROOF
      // Jika ada foto → upgrade ke COMPLETED
      // Jika tidak ada foto → pertahankan status lama
      if (
        (overtime.status === "COMPLETED" || overtime.status === "NEED_PROOF") &&
        !overtime.proof_photo_url
      ) {
        const { data, error } = await supabase
          .from("overtime_requests")
          .update({
            proof_photo_url: proof_photo_url ?? null,
            // ✅ Upgrade ke COMPLETED hanya jika foto berhasil diupload
            status: proof_photo_url ? "COMPLETED" : overtime.status,
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

      // ✅ Kasus 2: Selesaikan overtime yang sedang ONGOING (manual oleh karyawan)
      if (!["APPROVED", "ONGOING"].includes(overtime.status)) {
        return NextResponse.json(
          { success: false, message: "Status tidak valid untuk complete" },
          { status: 400 }
        );
      }

      const startReference = overtime.actual_start;
      if (!startReference) {
        return NextResponse.json(
          { success: false, message: "actual_start tidak ditemukan." },
          { status: 400 }
        );
      }

      const actualEnd = auto_completed === true
        ? (overtime.scheduled_end ?? new Date().toISOString())
        : new Date().toISOString();

      const startMs = new Date(startReference).getTime();
      const endMs = new Date(actualEnd).getTime();

      if (endMs <= startMs) {
        return NextResponse.json(
          { success: false, message: "Waktu selesai tidak valid" },
          { status: 400 }
        );
      }

      const durationMins = Math.round((endMs - startMs) / 60000);
      const ratePerHour = overtime.rate_per_hour ?? 0;
      const billedHours = Math.floor(durationMins / 60);
      const calculatedPay = billedHours * ratePerHour;

      const updates: any = {
        actual_end: actualEnd,
        // ✅ COMPLETED jika ada foto, NEED_PROOF jika belum ada foto
        status: proof_photo_url ? "COMPLETED" : "NEED_PROOF",
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
      // ✅ Hanya FULL_ACCESS yang boleh mengubah bayaran
      if (!FULL_ACCESS.includes(user.role)) {
        return NextResponse.json(
          { success: false, message: "Tidak berwenang mengubah total bayar" },
          { status: 403 }
        );
      }

      // ✅ Boleh SET_PAY untuk COMPLETED atau NEED_PROOF
      if (overtime.status !== "COMPLETED" && overtime.status !== "NEED_PROOF") {
        return NextResponse.json(
          { success: false, message: "Bayaran hanya bisa diatur setelah lembur selesai" },
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

    // ─── UPDATE ───────────────────────────────────────────────────────────
    if (action === "UPDATE") {
      if (!FULL_ACCESS.includes(user.role)) {
        return NextResponse.json(
          { success: false, message: "Tidak berwenang mengubah data lembur" },
          { status: 403 }
        );
      }

      const {
        request_date: newDate,
        scheduled_start: newSchedStart,
        scheduled_end: newSchedEnd,
        actual_start: newActualStart,
        actual_end: newActualEnd,
        reason: newReason,
        work_description: newWorkDesc,
        proof_photo_url: newProofUrl,
        rate_per_hour: newRate,
        status: newStatus,
      } = body;

      const resolvedStart = newActualStart ?? overtime.actual_start;
      const resolvedEnd = newActualEnd ?? overtime.actual_end;
      const resolvedRate = newRate ?? overtime.rate_per_hour ?? 0;

      let durationMins: number | undefined;
      let totalPay: number | undefined;

      if (resolvedStart && resolvedEnd) {
        const startMs = new Date(resolvedStart).getTime();
        const endMs = new Date(resolvedEnd).getTime();
        if (endMs > startMs) {
          durationMins = Math.round((endMs - startMs) / 60000);
          const billedHours = Math.floor(durationMins / 60);
          totalPay = billedHours * resolvedRate;
        }
      }

      const updatePayload: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (newDate !== undefined) updatePayload.request_date = newDate;
      if (newSchedStart !== undefined) updatePayload.scheduled_start = newSchedStart;
      if (newSchedEnd !== undefined) updatePayload.scheduled_end = newSchedEnd;
      if (newActualStart !== undefined) updatePayload.actual_start = newActualStart;
      if (newActualEnd !== undefined) updatePayload.actual_end = newActualEnd;
      if (newReason !== undefined) updatePayload.reason = newReason;
      if (newWorkDesc !== undefined) updatePayload.work_description = newWorkDesc;
      if (newProofUrl !== undefined) updatePayload.proof_photo_url = newProofUrl;
      if (newRate !== undefined) updatePayload.rate_per_hour = Math.round(newRate);
      if (newStatus !== undefined) updatePayload.status = newStatus;
      if (durationMins !== undefined) updatePayload.duration_minutes = durationMins;
      if (totalPay !== undefined) updatePayload.total_pay = Math.round(totalPay);

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

// ─── DELETE ───────────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ success: false }, { status: 401 });

    if (!FULL_ACCESS.includes(user.role)) {
      return NextResponse.json(
        { success: false, message: "Tidak berwenang menghapus data lembur" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "id wajib disertakan" },
        { status: 400 }
      );
    }

    const { data: existing, error: findError } = await supabase
      .from("overtime_requests")
      .select("id, proof_photo_url")
      .eq("id", id)
      .single();

    if (findError || !existing) {
      return NextResponse.json(
        { success: false, message: "Data lembur tidak ditemukan" },
        { status: 404 }
      );
    }

    if (existing.proof_photo_url) {
      const urlParts = existing.proof_photo_url.split("/documents/");
      if (urlParts.length > 1) {
        const storagePath = urlParts[1];
        await supabase.storage.from("documents").remove([storagePath]);
        console.log(`[DELETE] Removed storage file: ${storagePath}`);
      }
    }

    const { error } = await supabase
      .from("overtime_requests")
      .delete()
      .eq("id", id);

    if (error)
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );

    console.log(`[DELETE] Overtime ${id} deleted by ${user.id}`);
    return NextResponse.json({ success: true, message: "Data lembur berhasil dihapus" });
  } catch (err: any) {
    console.error("[DELETE Error]", err);
    return NextResponse.json(
      { success: false, message: err?.message },
      { status: 500 }
    );
  }
}