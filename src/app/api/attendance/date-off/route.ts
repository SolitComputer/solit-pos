import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isFullAccessMulti, getEffectiveSubordinates } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Multi-role helper ─────────────────────────────────────────────────────────
// Ambil semua role user (dukung akun multi-role; fallback ke single role).
function rolesOf(user: any): string[] {
  return Array.isArray(user?.roles) && user.roles.length > 0
    ? user.roles
    : user?.role ? [user.role] : [];
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const userRoles = rolesOf(user);

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");
    const month = searchParams.get("month");

    // Gunakan select tanpa FK join dulu (lebih aman, hindari FK name salah)
    let query = supabase
      .from("user_date_off")
      .select("id, user_id, off_date, note, notes, swap_group_id, created_at")
      .order("off_date", { ascending: true });

    // Filter by bulan jika ada
    if (year && month) {
      const y = parseInt(year);
      const m = parseInt(month);
      const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m, 0);
      const lastDayStr = `${y}-${String(m).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
      query = query.gte("off_date", firstDay).lte("off_date", lastDayStr);
    }

    // Scope by role (multi-role aware)
    if (isFullAccessMulti(userRoles)) {
      // lihat semua, tidak perlu filter
    } else {
      const subordinateRoles = getEffectiveSubordinates(userRoles); // union semua role
      if (subordinateRoles.length > 0) {
        const { data: subUsers } = await supabase
          .from("users")
          .select("id")
          .in("role", subordinateRoles as string[]);
        const subIds = (subUsers ?? []).map((u: any) => u.id);
        query = query.in("user_id", [user.id, ...subIds]);
      } else {
        query = query.eq("user_id", user.id);
      }
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

    const userRoles = rolesOf(user);

    // Hanya full access atau kepala divisi (satu/lebih) yang bisa set libur untuk orang lain
    const canManage = isFullAccessMulti(userRoles) || getEffectiveSubordinates(userRoles).length > 0;
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

    // Kepala divisi (bukan full access): validasi target user adalah salah satu bawahannya
    if (!isFullAccessMulti(userRoles)) {
      const { data: targetUser, error: targetErr } = await supabase
        .from("users")
        .select("id, role")
        .eq("id", user_id)
        .single();

      if (targetErr || !targetUser) {
        return NextResponse.json({ success: false, message: "User tidak ditemukan" }, { status: 404 });
      }

      if (!(getEffectiveSubordinates(userRoles) as string[]).includes(targetUser.role)) {
        return NextResponse.json(
          { success: false, message: "User bukan anggota divisi kamu" },
          { status: 403 }
        );
      }
    }

    const { data, error } = await supabase
      .from("user_date_off")
      .upsert(
        { user_id, off_date, note: notes || null, created_by: user.id },
        { onConflict: "user_id,off_date" }
      )
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

    const userRoles = rolesOf(user);

    const canManage = isFullAccessMulti(userRoles) || getEffectiveSubordinates(userRoles).length > 0;
    if (!canManage) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get("user_id");
    const off_date = searchParams.get("off_date");

    if (!user_id || !off_date) {
      return NextResponse.json({ success: false, message: "user_id dan off_date wajib" }, { status: 400 });
    }

    // Kepala divisi (bukan full access): validasi target user adalah salah satu bawahannya
    if (!isFullAccessMulti(userRoles)) {
      const { data: targetUser } = await supabase
        .from("users")
        .select("id, role")
        .eq("id", user_id)
        .single();

      if (!targetUser || !(getEffectiveSubordinates(userRoles) as string[]).includes(targetUser.role)) {
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