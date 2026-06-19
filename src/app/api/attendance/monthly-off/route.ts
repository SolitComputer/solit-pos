import { NextResponse } from "next/server";
import { getCurrentUser, isDivisionHead, isFullAccess } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { DIVISION_MAP } from "@/lib/permissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_OFF_PER_MONTH = 4;

function canManageUser(actorRole: string, targetRole: string): boolean {
  if (isFullAccess(actorRole)) return true;
  if (!isDivisionHead(actorRole)) return false;
  const subordinates = DIVISION_MAP[actorRole] ?? [];
  return (subordinates as string[]).includes(targetRole);
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year  = Number(searchParams.get("year")  ?? new Date().getFullYear());
    const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);
    const targetUserId = searchParams.get("user_id");

    // Validasi range
    if (month < 1 || month > 12) {
      return NextResponse.json({ success: false, message: "Bulan tidak valid" }, { status: 400 });
    }

    // Full access → bisa lihat semua atau spesifik
    if (isFullAccess(user.role)) {
      let q = supabase
        .from("user_monthly_off")
        .select(`
          id, user_id, off_date, year, month, notes, set_by, created_at,
          users!user_monthly_off_user_id_fkey (id, name, role)
        `)
        .eq("year", year)
        .eq("month", month)
        .order("off_date");

      if (targetUserId) q = q.eq("user_id", targetUserId);

      const { data, error } = await q;
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data: data ?? [] });
    }

    // Kepala divisi → lihat bawahanya saja
    if (isDivisionHead(user.role)) {
      const subordinateRoles = DIVISION_MAP[user.role] ?? [];
      if (subordinateRoles.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }

      // Ambil user_id bawahan
      const { data: subordinateUsers } = await supabase
        .from("users")
        .select("id, name, role")
        .in("role", subordinateRoles as string[]);

      const subordinateIds = (subordinateUsers ?? []).map((u: any) => u.id);

      if (targetUserId && !subordinateIds.includes(targetUserId)) {
        return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
      }

      let q = supabase
        .from("user_monthly_off")
        .select(`
          id, user_id, off_date, year, month, notes, set_by, created_at,
          users!user_monthly_off_user_id_fkey (id, name, role)
        `)
        .eq("year", year)
        .eq("month", month)
        .in("user_id", targetUserId ? [targetUserId] : subordinateIds)
        .order("off_date");

      const { data, error } = await q;
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data: data ?? [] });
    }

    // User biasa → hanya lihat miliknya sendiri
    const { data, error } = await supabase
      .from("user_monthly_off")
      .select("id, user_id, off_date, year, month, notes, created_at")
      .eq("user_id", user.id)
      .eq("year", year)
      .eq("month", month)
      .order("off_date");

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: data ?? [] });

  } catch (err: any) {
    console.error("[monthly-off GET]", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// ── POST — set tanggal libur ──────────────────────────────────────────────────
// Body: { user_id, off_date: "2025-06-15", notes? }
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const body = await request.json();
    const { user_id, off_date, notes } = body;

    if (!user_id || !off_date) {
      return NextResponse.json({ success: false, message: "user_id dan off_date wajib diisi" }, { status: 400 });
    }

    // Validasi format tanggal
    const dateObj = new Date(off_date + "T12:00:00");
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json({ success: false, message: "Format tanggal tidak valid (YYYY-MM-DD)" }, { status: 400 });
    }

    const year  = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1; // 1-12

    // Cek target user ada dan ambil rolenya
    const { data: targetUser, error: userError } = await supabase
      .from("users")
      .select("id, name, role")
      .eq("id", user_id)
      .maybeSingle();

    if (userError || !targetUser) {
      return NextResponse.json({ success: false, message: "User tidak ditemukan" }, { status: 404 });
    }

    // Cek permission
    if (!canManageUser(user.role, targetUser.role)) {
      return NextResponse.json({
        success: false,
        message: "Kamu tidak punya akses untuk mengatur libur karyawan ini",
      }, { status: 403 });
    }

    // ── Cek sudah ada di bulan ini berapa libur ───────────────────────────────
    const { data: existing, error: countError } = await supabase
      .from("user_monthly_off")
      .select("id, off_date")
      .eq("user_id", user_id)
      .eq("year", year)
      .eq("month", month);

    if (countError) {
      return NextResponse.json({ success: false, message: countError.message }, { status: 500 });
    }

    // Cek apakah tanggal ini sudah ada (duplicate)
    const alreadyExists = (existing ?? []).some(r => r.off_date === off_date);
    if (alreadyExists) {
      return NextResponse.json({
        success: false,
        message: `Tanggal ${off_date} sudah terdaftar sebagai hari libur ${targetUser.name}`,
      }, { status: 409 });
    }

    // Cek kuota maksimal 4x per bulan
    const currentCount = (existing ?? []).length;
    if (currentCount >= MAX_OFF_PER_MONTH) {
      return NextResponse.json({
        success: false,
        message: `${targetUser.name} sudah memiliki ${MAX_OFF_PER_MONTH} hari libur di bulan ${month}/${year}. Maksimal ${MAX_OFF_PER_MONTH} hari/bulan.`,
      }, { status: 400 });
    }

    // ── Insert ────────────────────────────────────────────────────────────────
    const { data, error } = await supabase
      .from("user_monthly_off")
      .insert({
        user_id,
        off_date,
        year,
        month,
        notes: notes || null,
        set_by: user.id,
      })
      .select(`
        id, user_id, off_date, year, month, notes, set_by, created_at,
        users!user_monthly_off_user_id_fkey (id, name, role)
      `)
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({
          success: false,
          message: `Tanggal ${off_date} sudah terdaftar sebagai hari libur`,
        }, { status: 409 });
      }
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data,
      remaining: MAX_OFF_PER_MONTH - currentCount - 1,
    });

  } catch (err: any) {
    console.error("[monthly-off POST]", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, message: "id wajib diisi" }, { status: 400 });
    }

    const { data: record, error: fetchError } = await supabase
      .from("user_monthly_off")
      .select(`
        id, user_id, off_date, year, month,
        users!user_monthly_off_user_id_fkey (id, name, role)
      `)
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !record) {
      return NextResponse.json({ success: false, message: "Data libur tidak ditemukan" }, { status: 404 });
    }

    const targetRole = (record as any).users?.role ?? "";

    if (!canManageUser(user.role, targetRole)) {
      return NextResponse.json({
        success: false,
        message: "Kamu tidak punya akses untuk menghapus libur karyawan ini",
      }, { status: 403 });
    }

    const { error } = await supabase
      .from("user_monthly_off")
      .delete()
      .eq("id", id);

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("[monthly-off DELETE]", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}