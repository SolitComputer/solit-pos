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

// ── GET — tidak berubah ──────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get("year") ?? new Date().getFullYear());
    const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);
    const targetUserId = searchParams.get("user_id");

    if (month < 1 || month > 12) {
      return NextResponse.json({ success: false, message: "Bulan tidak valid" }, { status: 400 });
    }

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

    if (isDivisionHead(user.role)) {
      const subordinateRoles = DIVISION_MAP[user.role] ?? [];
      if (subordinateRoles.length === 0) return NextResponse.json({ success: true, data: [] });

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

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const body = await request.json();

    // ── MODE SWAP ─────────────────────────────────────────────────────────────
    if (body.mode === "swap") {
      const { user_id, weekly_date, replacement_date, notes } = body;

      if (!user_id || !weekly_date || !replacement_date) {
        return NextResponse.json(
          { success: false, message: "user_id, weekly_date, dan replacement_date wajib diisi" },
          { status: 400 }
        );
      }

      if (weekly_date === replacement_date) {
        return NextResponse.json(
          { success: false, message: "Tanggal asal dan pengganti tidak boleh sama" },
          { status: 400 }
        );
      }

      const weeklyObj = new Date(weekly_date + "T12:00:00");
      const replacementObj = new Date(replacement_date + "T12:00:00");
      if (isNaN(weeklyObj.getTime()) || isNaN(replacementObj.getTime())) {
        return NextResponse.json({ success: false, message: "Format tanggal tidak valid" }, { status: 400 });
      }

      // Cek permission
      const { data: targetUser } = await supabase
        .from("users").select("id, name, role").eq("id", user_id).maybeSingle();
      if (!targetUser) {
        return NextResponse.json({ success: false, message: "User tidak ditemukan" }, { status: 404 });
      }
      if (!canManageUser(user.role, targetUser.role)) {
        return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
      }

      // Cek weekly_date belum di-swap
      const { data: existingWork } = await supabase
        .from("user_date_work")
        .select("id")
        .eq("user_id", user_id)
        .eq("work_date", weekly_date)
        .maybeSingle();

      if (existingWork) {
        return NextResponse.json(
          { success: false, message: `Hari ${weekly_date} sudah pernah ditukar sebelumnya` },
          { status: 409 }
        );
      }

      // Cek replacement_date belum jadi monthly_off
      const { data: existingMonthlyOff } = await supabase
        .from("user_monthly_off")
        .select("id")
        .eq("user_id", user_id)
        .eq("off_date", replacement_date)
        .maybeSingle();

      if (existingMonthlyOff) {
        return NextResponse.json(
          { success: false, message: `Tanggal pengganti ${replacement_date} sudah terdaftar sebagai hari libur` },
          { status: 409 }
        );
      }

      // Cek replacement_date belum jadi date_off lain
      const { data: existingDateOff } = await supabase
        .from("user_date_off")
        .select("id")
        .eq("user_id", user_id)
        .eq("off_date", replacement_date)
        .maybeSingle();

      if (existingDateOff) {
        return NextResponse.json(
          { success: false, message: `Tanggal pengganti ${replacement_date} sudah terdaftar sebagai libur lain` },
          { status: 409 }
        );
      }

      // ── Step 1: Insert date_work ─────────────────────────────────────────────
      const workNote = `[SWAP] Pengganti: ${replacement_date}${notes ? ` — ${notes}` : ""}`;

      const { error: workError } = await supabase
        .from("user_date_work")
        .insert({
          user_id,
          work_date: weekly_date,
          note: workNote,
          created_by: user.id,
        });

      if (workError) {
        if (workError.code === "23505") {
          return NextResponse.json(
            { success: false, message: `Hari ${weekly_date} sudah ada di date_work` },
            { status: 409 }
          );
        }
        return NextResponse.json({ success: false, message: workError.message }, { status: 500 });
      }

      // ── Step 2: Insert date_off ──────────────────────────────────────────────
      const dateOffNote = `[SWAP] Dari: ${weekly_date}${notes ? ` — ${notes}` : ""}`;

      const { error: dateOffError } = await supabase
        .from("user_date_off")
        .insert({
          user_id,
          off_date: replacement_date,
          notes: dateOffNote,
          created_by: user.id,
          swap_group_id: `swap_${user_id}_${weekly_date}`,
        });

      if (dateOffError) {
        // Rollback step 1
        await supabase
          .from("user_date_work")
          .delete()
          .eq("user_id", user_id)
          .eq("work_date", weekly_date);

        return NextResponse.json(
          { success: false, message: `Gagal set hari pengganti: ${dateOffError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        mode: "swap",
        data: { weekly_date, replacement_date },
      });
    }

    // ── MODE NORMAL ───────────────────────────────────────────────────────────
    // ↑ BAGIAN INI YANG HILANG — ini penyebab 500 untuk klik libur biasa
    const { user_id, off_date, notes } = body;

    if (!user_id || !off_date) {
      return NextResponse.json(
        { success: false, message: "user_id dan off_date wajib diisi" },
        { status: 400 }
      );
    }

    const dateObj = new Date(off_date + "T12:00:00");
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json(
        { success: false, message: "Format tanggal tidak valid (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1;

    const { data: targetUser, error: userError } = await supabase
      .from("users").select("id, name, role").eq("id", user_id).maybeSingle();

    if (userError || !targetUser) {
      return NextResponse.json({ success: false, message: "User tidak ditemukan" }, { status: 404 });
    }

    if (!canManageUser(user.role, targetUser.role)) {
      return NextResponse.json(
        { success: false, message: "Kamu tidak punya akses untuk mengatur libur karyawan ini" },
        { status: 403 }
      );
    }

    const { data: existing, error: countError } = await supabase
      .from("user_monthly_off")
      .select("id, off_date")
      .eq("user_id", user_id)
      .eq("year", year)
      .eq("month", month);

    if (countError) {
      return NextResponse.json({ success: false, message: countError.message }, { status: 500 });
    }

    const alreadyExists = (existing ?? []).some(r => r.off_date === off_date);
    if (alreadyExists) {
      return NextResponse.json(
        { success: false, message: `Tanggal ${off_date} sudah terdaftar sebagai hari libur ${targetUser.name}` },
        { status: 409 }
      );
    }

    const currentCount = (existing ?? []).length;
    if (currentCount >= MAX_OFF_PER_MONTH) {
      return NextResponse.json(
        {
          success: false,
          message: `${targetUser.name} sudah memiliki ${MAX_OFF_PER_MONTH} hari libur di bulan ${month}/${year}.`,
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("user_monthly_off")
      .insert({ user_id, off_date, year, month, notes: notes || null, set_by: user.id })
      .select(`
        id, user_id, off_date, year, month, notes, set_by, created_at,
        users!user_monthly_off_user_id_fkey (id, name, role)
      `)
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { success: false, message: `Tanggal ${off_date} sudah terdaftar sebagai hari libur` },
          { status: 409 }
        );
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

// ── DELETE — hapus libur normal ATAU rollback swap ────────────────────────────
// Normal swap rollback: ?weekly_date=2025-06-01&replacement_date=2025-06-03&user_id=xxx
// Normal delete       : ?id=xxx
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const weekly_date = searchParams.get("weekly_date");
    const replacement_date = searchParams.get("replacement_date");
    const userId = searchParams.get("user_id");

    // ── ROLLBACK SWAP ─────────────────────────────────────────────────────────
    if (weekly_date && replacement_date && userId) {
      // Cek permission
      const { data: targetUser } = await supabase
        .from("users").select("id, role").eq("id", userId).maybeSingle();
      if (!targetUser) return NextResponse.json({ success: false, message: "User tidak ditemukan" }, { status: 404 });
      if (!canManageUser(user.role, targetUser.role)) {
        return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
      }

      // Hapus date_work (weekly_date kembali jadi libur mingguan)
      const { error: workDelError } = await supabase
        .from("user_date_work")
        .delete()
        .eq("user_id", userId)
        .eq("work_date", weekly_date);

      if (workDelError) {
        return NextResponse.json({ success: false, message: workDelError.message }, { status: 500 });
      }

      // Hapus date_off (replacement_date kembali jadi hari biasa)
      const { error: dateOffDelError } = await supabase
        .from("user_date_off")
        .delete()
        .eq("user_id", userId)
        .eq("off_date", replacement_date);

      if (dateOffDelError) {
        return NextResponse.json({ success: false, message: dateOffDelError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, mode: "swap_rollback" });
    }

    // ── NORMAL DELETE ─────────────────────────────────────────────────────────
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
      return NextResponse.json(
        { success: false, message: "Kamu tidak punya akses untuk menghapus libur karyawan ini" },
        { status: 403 }
      );
    }

    const { error } = await supabase.from("user_monthly_off").delete().eq("id", id);
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("[monthly-off DELETE]", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}