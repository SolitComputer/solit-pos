import { NextResponse } from "next/server";
import { getCurrentUser, isFullAccess } from "@/lib/auth";
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

    let query = supabase
      .from("user_date_work")
      .select(`
        id,
        user_id,
        work_date,
        note,
        created_at,
        users!user_date_work_user_id_fkey (id, name, role)
      `)
      .order("work_date", { ascending: true });

    // Filter by month jika ada
    if (year && month) {
      const y = parseInt(year);
      const m = parseInt(month);
      const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m, 0);
      const lastDayStr = `${y}-${String(m).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
      query = query.gte("work_date", firstDay).lte("work_date", lastDayStr);
    }

    if (!isFullAccess(user.role)) {
      query = query.eq("user_id", user.id);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !isFullAccess(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const body = await request.json();
    const { user_id, work_date, note } = body;

    if (!user_id || !work_date) {
      return NextResponse.json(
        { success: false, message: "user_id dan work_date wajib diisi" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("user_date_work")
      .upsert(
        { user_id, work_date, note: note || null, created_by: user.id },
        { onConflict: "user_id,work_date" }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// DELETE — hapus date-work override
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !isFullAccess(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    // Alternatif: hapus by user_id + work_date
    const userId = searchParams.get("user_id");
    const workDate = searchParams.get("work_date");

    if (!id && !(userId && workDate)) {
      return NextResponse.json(
        { success: false, message: "id atau user_id+work_date wajib diisi" },
        { status: 400 }
      );
    }

    let query = supabase.from("user_date_work").delete();
    if (id) {
      query = query.eq("id", id);
    } else {
      query = query.eq("user_id", userId!).eq("work_date", workDate!);
    }

    const { error } = await query;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}