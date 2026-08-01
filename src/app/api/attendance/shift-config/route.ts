import { NextResponse } from "next/server";
import { getCurrentUser, isDivisionHead } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { getAttendanceScope } from "@/lib/attendanceScope";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SHIFT_DEFAULTS = {
  PAGI: { open_hour: 7, open_minute: 30, late_hour: 8, late_minute: 0, close_hour: 12, close_minute: 0, checkout_hour: 17, checkout_minute: 0 },
  SORE: { open_hour: 14, open_minute: 0, late_hour: 16, late_minute: 0, close_hour: 18, close_minute: 0, checkout_hour: 21, checkout_minute: 0 },
} as const;

// GET — config (admin: semua | kepala: bawahannya | user: dirinya)
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("user_id");

    const scope = await getAttendanceScope(supabase, user);
    const canManage = scope.all || isDivisionHead(user.role);

    // Pengelola minta config 1 user spesifik
    if (canManage && targetUserId) {
      // Kepala divisi cuma boleh lihat config bawahannya
      if (!scope.all && !scope.manageableIds.includes(targetUserId)) {
        return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
      }
      const { data, error } = await supabase
        .from("user_shift_config")
        .select("*")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    // Pengelola tanpa target → daftar gabungan (admin: semua, kepala: bawahannya)
    if (canManage) {
      let usersQuery = supabase
        .from("users")
        .select("id, name, role, shift")
        .order("name");

      if (!scope.all) {
        usersQuery = usersQuery.in("id", scope.manageableIds);
      }

      const { data: scopedUsers } = await usersQuery;
      const { data: allConfigs } = await supabase.from("user_shift_config").select("*");

      const configMap: Record<string, any> = {};
      (allConfigs || []).forEach((c: any) => { configMap[c.user_id] = c; });

      const combined = (scopedUsers || []).map((u: any) => {
        const config = configMap[u.id];
        const defaults = SHIFT_DEFAULTS[u.shift as keyof typeof SHIFT_DEFAULTS] ?? SHIFT_DEFAULTS.PAGI;
        return {
          user_id: u.id,
          user_name: u.name,
          user_role: u.role,
          shift: u.shift ?? "PAGI",
          has_custom: !!config,
          open_hour: config?.open_hour ?? defaults.open_hour,
          open_minute: config?.open_minute ?? defaults.open_minute,
          late_hour: config?.late_hour ?? defaults.late_hour,
          late_minute: config?.late_minute ?? defaults.late_minute,
          close_hour: config?.close_hour ?? defaults.close_hour,
          close_minute: config?.close_minute ?? defaults.close_minute,
          checkout_hour: config?.checkout_hour ?? defaults.checkout_hour, // ✅ NEW
          checkout_minute: config?.checkout_minute ?? defaults.checkout_minute, // ✅ NEW
          config_id: config?.id ?? null,
        };
      });

      return NextResponse.json({ success: true, data: combined });
    }

    // User biasa → config dirinya sendiri
    const { data: userData } = await supabase
      .from("users")
      .select("shift")
      .eq("id", user.id)
      .single();

    const userShift = (userData?.shift ?? "PAGI") as keyof typeof SHIFT_DEFAULTS;
    const defaults = SHIFT_DEFAULTS[userShift] ?? SHIFT_DEFAULTS.PAGI;

    const { data: config } = await supabase
      .from("user_shift_config")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      data: {
        user_id: user.id,
        shift: userShift,
        has_custom: !!config,
        open_hour: config?.open_hour ?? defaults.open_hour,
        open_minute: config?.open_minute ?? defaults.open_minute,
        late_hour: config?.late_hour ?? defaults.late_hour,
        late_minute: config?.late_minute ?? defaults.late_minute,
        close_hour: config?.close_hour ?? defaults.close_hour,
        close_minute: config?.close_minute ?? defaults.close_minute,
        checkout_hour: config?.checkout_hour ?? defaults.checkout_hour, // ✅ NEW
        checkout_minute: config?.checkout_minute ?? defaults.checkout_minute, // ✅ NEW
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// POST — upsert config (admin: siapa saja | kepala: bawahannya)
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

 const body = await request.json();
    const {
      user_id, shift,
      open_hour, open_minute = 0,
      late_hour, late_minute = 0,
      close_hour, close_minute = 0,
      checkout_hour, checkout_minute = 0, // ✅ NEW — jam pulang
    } = body;

    if (!user_id) {
      return NextResponse.json({ success: false, message: "user_id wajib" }, { status: 400 });
    }
    if (checkout_hour === undefined || checkout_hour === null) {
      return NextResponse.json({ success: false, message: "checkout_hour (jam pulang) wajib diisi" }, { status: 400 });
    }

    // Izin: full access → semua | kepala divisi → hanya bawahannya
    const scope = await getAttendanceScope(supabase, user);
    const allowed = scope.all || scope.manageableIds.includes(user_id);
    if (!allowed) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    // Validasi logika waktu: open < late < close < checkout
    const openTotal = open_hour * 60 + open_minute;
    const lateTotal = late_hour * 60 + late_minute;
    const closeTotal = close_hour * 60 + close_minute;
    const checkoutTotal = checkout_hour * 60 + checkout_minute; // ✅ NEW

    if (openTotal >= lateTotal) {
      return NextResponse.json({ success: false, message: "Jam buka harus sebelum jam telat" }, { status: 400 });
    }
    if (lateTotal >= closeTotal) {
      return NextResponse.json({ success: false, message: "Jam telat harus sebelum jam tutup" }, { status: 400 });
    }
    if (closeTotal >= checkoutTotal) {
      return NextResponse.json({ success: false, message: "Jam pulang harus setelah batas absen masuk (jam tutup)" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("user_shift_config")
      .upsert(
        {
          user_id,
          shift: shift || "PAGI",
          open_hour, open_minute,
          late_hour, late_minute,
          close_hour, close_minute,
          checkout_hour, checkout_minute, // ✅ NEW
          created_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    if (shift) {
      await supabase.from("users").update({ shift }).eq("id", user_id);
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// DELETE — reset config ke default (admin: siapa saja | kepala: bawahannya)
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get("user_id");

    if (!user_id) {
      return NextResponse.json({ success: false, message: "user_id wajib" }, { status: 400 });
    }

    const scope = await getAttendanceScope(supabase, user);
    const allowed = scope.all || scope.manageableIds.includes(user_id);
    if (!allowed) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const { error } = await supabase
      .from("user_shift_config")
      .delete()
      .eq("user_id", user_id);

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}