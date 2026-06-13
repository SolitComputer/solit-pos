import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isFullAccess, isDivisionHead, getSubordinateRoles, isSubordinate } from "@/lib/permissions";
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
    const year = searchParams.get("year");
    const month = searchParams.get("month");

    const canManage = isFullAccess(user.role) || isDivisionHead(user.role);

    let q = supabase
      .from("user_date_off")
      .select("id, user_id, off_date, note, created_at")
      .order("off_date", { ascending: true });

    if (!canManage) {
      // Karyawan biasa: hanya miliknya
      q = q.eq("user_id", user.id);
    } else if (isDivisionHead(user.role) && !isFullAccess(user.role)) {
      // Kepala divisi: hanya tampilkan data milik anggota divisinya
      // Kita filter di aplikasi setelah join users
    }
    // Full access: tidak filter — ambil semua

    if (year && month) {
      const paddedMonth = String(month).padStart(2, "0");
      const from = `${year}-${paddedMonth}-01`;
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      const to = `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`;
      q = q.gte("off_date", from).lte("off_date", to);
    }

    const { data: dateOffData, error } = await q;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    if (!dateOffData || dateOffData.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Ambil user info
    const userIds = [...new Set(dateOffData.map((d: any) => d.user_id))];
    const { data: usersData } = await supabase
      .from("users")
      .select("id, name, role")
      .in("id", userIds);

    const usersMap: Record<string, { id: string; name: string; role: string }> = {};
    (usersData || []).forEach((u: any) => { usersMap[u.id] = u; });

    let combined = dateOffData.map((d: any) => ({
      ...d,
      users: usersMap[d.user_id] || null,
    }));

    // Untuk kepala divisi non-full-access: filter hanya anggota divisinya
    if (isDivisionHead(user.role) && !isFullAccess(user.role)) {
      const subordinateRoles = getSubordinateRoles(user.role);
      combined = combined.filter((d: any) =>
        d.users && subordinateRoles.includes(d.users.role)
      );
    }

    return NextResponse.json({ success: true, data: combined });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
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
      .upsert({
        user_id,
        off_date,
        note: notes || null,
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