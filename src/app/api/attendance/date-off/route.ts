import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
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

    // ── Step 1: ambil date_off records ─────────────────────────────────────
    let q = supabase
      .from("user_date_off")
      .select("id, user_id, off_date, notes, created_at")
      .order("off_date", { ascending: true });

    if (user.role !== "ADMIN") {
      q = q.eq("user_id", user.id);
    }

    if (year && month) {
      const paddedMonth = String(month).padStart(2, "0");
      const from     = `${year}-${paddedMonth}-01`;
      const lastDay  = new Date(Number(year), Number(month), 0).getDate();
      const to       = `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`;
      q = q.gte("off_date", from).lte("off_date", to);
    }

    const { data: dateOffData, error } = await q;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    if (!dateOffData || dateOffData.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // ── Step 2: ambil user info secara terpisah ────────────────────────────
    const userIds = [...new Set(dateOffData.map((d: any) => d.user_id))];
    const { data: usersData } = await supabase
      .from("users")
      .select("id, name, role")
      .in("id", userIds);

    const usersMap: Record<string, { id: string; name: string; role: string }> = {};
    (usersData || []).forEach((u: any) => { usersMap[u.id] = u; });

    // ── Step 3: gabungkan ──────────────────────────────────────────────────
    const data = dateOffData.map((d: any) => ({
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
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Hanya admin" }, { status: 403 });
    }

    const body = await request.json();
    const { user_id, off_date, notes } = body;

    if (!user_id || !off_date) {
      return NextResponse.json({ success: false, message: "user_id dan off_date wajib" }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(off_date)) {
      return NextResponse.json({ success: false, message: "Format tanggal: YYYY-MM-DD" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("user_date_off")
      .upsert({
        user_id,
        off_date,
        notes: notes || null,
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
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Hanya admin" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const user_id  = searchParams.get("user_id");
    const off_date = searchParams.get("off_date");

    if (!user_id || !off_date) {
      return NextResponse.json({ success: false, message: "user_id dan off_date wajib" }, { status: 400 });
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