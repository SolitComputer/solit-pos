import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isFullAccess, isDivisionHead, getSubordinateRoles, isSubordinate, DIVISION_MAP  } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year  = searchParams.get("year");
    const month = searchParams.get("month");

    // ← Gunakan select tanpa FK join dulu (lebih aman, hindari FK name salah)
    let query = supabase
      .from("user_date_off")
      .select("id, user_id, off_date, note, notes, swap_group_id, created_at")
      .order("off_date", { ascending: true });

    // Filter by bulan jika ada
    if (year && month) {
      const y = parseInt(year);
      const m = parseInt(month);
      const firstDay   = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay    = new Date(y, m, 0);
      const lastDayStr = `${y}-${String(m).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
      query = query.gte("off_date", firstDay).lte("off_date", lastDayStr);
    }

    // Scope by role
    if (isFullAccess(user.role)) {
      // lihat semua, tidak perlu filter
    } else if (isDivisionHead(user.role)) {
      const subordinateRoles = DIVISION_MAP[user.role] ?? [];
      const { data: subUsers } = await supabase
        .from("users")
        .select("id")
        .in("role", subordinateRoles as string[]);
      const subIds = (subUsers ?? []).map((u: any) => u.id);
      query = query.in("user_id", [user.id, ...subIds]);
    } else {
      query = query.eq("user_id", user.id);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[date-off GET]", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // Hanya full access atau kepala divisi yang bisa set libur untuk orang lain
    const canManage = isFullAccess(user.role) || isDivisionHead(user.role);
    if (!canManage) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const body = await request.json();
    const { user_id, off_date, notes } = body;

    if (!user_id || !off_date) {
      return NextResponse.json({ success: false, message: "user_id dan off_date wajib" }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(off_date)) {
      return NextResponse.json({ success: false, message: "Format tanggal: YYYY-MM-DD" }, { status: 400 });
    }

    // Kepala divisi: validasi target user adalah bawahannya
    if (isDivisionHead(user.role) && !isFullAccess(user.role)) {
      const { data: targetUser, error: targetErr } = await supabase
        .from("users")
        .select("id, role")
        .eq("id", user_id)
        .single();

      if (targetErr || !targetUser) {
        return NextResponse.json({ success: false, message: "User tidak ditemukan" }, { status: 404 });
      }

      if (!isSubordinate(user.role, targetUser.role)) {
        return NextResponse.json(
          { success: false, message: "User bukan anggota divisi kamu" },
          { status: 403 }
        );
      }
    }

    const { data, error } = await supabase
      .from("user_date_off")
      .upsert({ user_id, off_date, note: notes || null,
        created_by: user.id,
      }, { onConflict: "user_id,off_date" })
      .select()
      .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const canManage = isFullAccess(user.role) || isDivisionHead(user.role);
    if (!canManage) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get("user_id");
    const off_date = searchParams.get("off_date");

    if (!user_id || !off_date) {
      return NextResponse.json({ success: false, message: "user_id dan off_date wajib" }, { status: 400 });
    }

    // Kepala divisi: validasi target user adalah bawahannya
    if (isDivisionHead(user.role) && !isFullAccess(user.role)) {
      const { data: targetUser } = await supabase
        .from("users")
        .select("id, role")
        .eq("id", user_id)
        .single();

      if (!targetUser || !isSubordinate(user.role, targetUser.role)) {
        return NextResponse.json(
          { success: false, message: "User bukan anggota divisi kamu" },
          { status: 403 }
        );
      }
    }

    const { error } = await supabase
      .from("user_date_off")
      .delete()
      .eq("user_id", user_id)
      .eq("off_date", off_date);

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}