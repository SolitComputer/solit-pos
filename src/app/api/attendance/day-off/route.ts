import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isFullAccess, isDivisionHead } from "@/lib/auth";
import { DIVISION_MAP } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    let q = supabase
      .from("user_day_off")
      .select("id, user_id, day_of_week, notes, created_at")
      .order("user_id")
      .order("day_of_week")

    if (isFullAccess(user.role)) {
    } else if (isDivisionHead(user.role)) {
      const subRoles = (DIVISION_MAP[user.role] ?? []) as string[];
      if (subRoles.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }
      const { data: subs } = await supabase
        .from("users").select("id").in("role", subRoles);
      const subIds = (subs ?? []).map((s: any) => s.id);
      q = q.in("user_id", subIds.length ? subIds : ["00000000-0000-0000-0000-000000000000"]);
    } else {
      q = q.eq("user_id", user.id);
    }

    const { data: dayOffData, error: dayOffError } = await q;
    if (dayOffError) return NextResponse.json({ success: false, message: dayOffError.message }, { status: 500 });

    if (!dayOffData || dayOffData.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // ── Step 2: ambil user info secara terpisah (lebih aman dari FK join) ──
    const userIds = [...new Set(dayOffData.map((d: any) => d.user_id))];
    const { data: usersData } = await supabase
      .from("users")
      .select("id, name, role")
      .in("id", userIds);

    const usersMap: Record<string, { id: string; name: string; role: string }> = {};
    (usersData || []).forEach((u: any) => { usersMap[u.id] = u; });

    // ── Step 3: gabungkan ──────────────────────────────────────────────────
    const data = dayOffData.map((d: any) => ({
      ...d,
      users: usersMap[d.user_id] || null,
    }));

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !isFullAccess(user.role)) {
      return NextResponse.json({ success: false, message: "Hanya admin yang bisa mengatur hari libur" }, { status: 403 });
    }

    const body = await request.json();
    const { user_id, day_of_week, notes } = body;

    if (!user_id || day_of_week === undefined || day_of_week < 0 || day_of_week > 6) {
      return NextResponse.json({ success: false, message: "user_id dan day_of_week (0-6) wajib diisi" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("user_day_off")
      .upsert({
        user_id,
        day_of_week,
        notes: notes || null,
        created_by: user.id,
      }, { onConflict: "user_id,day_of_week" })
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
    if (!user || !isFullAccess(user.role)) {
      return NextResponse.json({ success: false, message: "Hanya admin" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const user_id    = searchParams.get("user_id");
    const day_of_week = searchParams.get("day_of_week");

    if (!user_id || day_of_week === null) {
      return NextResponse.json({ success: false, message: "user_id dan day_of_week wajib" }, { status: 400 });
    }

    const { error } = await supabase
      .from("user_day_off")
      .delete()
      .eq("user_id", user_id)
      .eq("day_of_week", Number(day_of_week));

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}