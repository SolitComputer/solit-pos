import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth } from "@/lib/auth";
import { hasAnyRole, SALES_REPORT_ROLES, SALES_REPORT_DELETE_ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/sales-reports?period=today|week|month
export const GET = withAuth(async (req, _ctx, user) => {
  try {
    const userRoles: string[] = user.roles?.length > 0 ? user.roles : [user.role];
    if (!hasAnyRole(userRoles, SALES_REPORT_ROLES)) {
      return NextResponse.json({ success: false, message: "Tidak punya akses" }, { status: 403 });
    }

    const url = new URL(req.url);
    const period = url.searchParams.get("period") ?? "today";

    const now = new Date();
    now.setHours(now.getHours() + 7); // Jakarta timezone, sama seperti leaderboard-kerja
    let startDate = new Date(now);
    let endDate = new Date(now);

    if (period === "today") {
      startDate.setUTCHours(0, 0, 0, 0);
      endDate.setUTCHours(23, 59, 59, 999);
    } else if (period === "week") {
      const day = startDate.getUTCDay();
      const diff = startDate.getUTCDate() - day + (day === 0 ? -6 : 1);
      startDate.setUTCDate(diff);
      startDate.setUTCHours(0, 0, 0, 0);
      endDate.setUTCHours(23, 59, 59, 999);
    } else if (period === "month") {
      startDate.setUTCDate(1);
      startDate.setUTCHours(0, 0, 0, 0);
      endDate.setUTCMonth(endDate.getUTCMonth() + 1, 0);
      endDate.setUTCHours(23, 59, 59, 999);
    }

    const { data, error } = await supabaseAdmin
      .from("sales_online_reports")
      .select("id, phone_number, interest, purchased, filled_by, filled_by_name, created_at")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error: any) {
    console.error("Sales report GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
});

// POST /api/sales-reports
export const POST = withAuth(async (req, _ctx, user) => {
  try {
    const userRoles: string[] = user.roles?.length > 0 ? user.roles : [user.role];
    if (!hasAnyRole(userRoles, SALES_REPORT_ROLES)) {
      return NextResponse.json({ success: false, message: "Tidak punya akses" }, { status: 403 });
    }

    const body = await req.json();
    const phoneNumber = (body.phone_number ?? "").toString().trim();
    const interest = (body.interest ?? "").toString().trim();
    const purchased = Boolean(body.purchased);

    if (!phoneNumber) {
      return NextResponse.json({ success: false, message: "Nomor telepon wajib diisi" }, { status: 400 });
    }
    if (!interest) {
      return NextResponse.json({ success: false, message: "Minat wajib diisi" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("sales_online_reports")
      .insert({
        phone_number: phoneNumber,
        interest,
        purchased,
        filled_by: user.id,
        filled_by_name: user.name,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Sales report POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
});

// DELETE /api/sales-reports?id=xxx
// Boleh dihapus oleh: pembuatnya sendiri (masih di hari yang sama, untuk
// perbaiki salah input) ATAU role full-access (Admin/Programmer/Asisten CEO).
export const DELETE = withAuth(async (req, _ctx, user) => {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, message: "id wajib diisi" }, { status: 400 });
    }

    const userRoles: string[] = user.roles?.length > 0 ? user.roles : [user.role];

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("sales_online_reports")
      .select("id, filled_by, created_at")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });
    }

    const isOwner = existing.filled_by === user.id;
    const isSameDay = new Date(existing.created_at).toDateString() === new Date().toDateString();
    const canDelete = hasAnyRole(userRoles, SALES_REPORT_DELETE_ROLES) || (isOwner && isSameDay);

    if (!canDelete) {
      return NextResponse.json({ success: false, message: "Tidak punya akses hapus" }, { status: 403 });
    }

    const { error } = await supabaseAdmin.from("sales_online_reports").delete().eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Sales report DELETE error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
});