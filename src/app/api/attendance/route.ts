import { NextResponse } from "next/server";
import { getCurrentUser, isFullAccess } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { getAttendanceScope } from "@/lib/attendanceScope";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) { 
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const scope = await getAttendanceScope(supabase, user);

    // ✅ FIX: Supabase/PostgREST default limit = 1000 baris/request.
    // Query lama tanpa .range() menyebabkan data terbaru (termasuk hari ini)
    // kepotong begitu total baris SUCCESS di tabel lewat 1000, karena
    // diurutkan ascending (lama → baru). Sekarang di-paginate sampai habis.
    const PAGE_SIZE = 1000;
    let allData: any[] = [];
    let from = 0;

    while (true) {
      let query = supabase
        .from("face_verifications")
        .select(`
          *,
          users!inner (
            id,
            name,
            role,
            shift
          )
        `)
        .in("status", ["SUCCESS"])
        .order("created_at", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (!scope.all) {
        query = query.in("user_id", scope.visibleIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Supabase error:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      }

      if (!data || data.length === 0) break;
      allData = allData.concat(data);

      if (data.length < PAGE_SIZE) break; // halaman terakhir
      from += PAGE_SIZE;
    }

    // Dedup logic TIDAK diubah — tetap ambil kejadian SUCCESS pertama
    // per user per hari (jam kedatangan asli), hanya sumber datanya
    // sekarang lengkap (tidak terpotong lagi).
    const seen = new Set<string>();
    const deduplicated = allData.filter((item: any) => {
      const wibDate = new Date(new Date(item.created_at).getTime() + 7 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      const key = `${item.user_id}_${wibDate}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const formattedData = deduplicated.map((item: any) => ({
      id: item.id,
      user_id: item.user_id,
      user_name: item.users?.name || "Unknown",
      user_role: item.users?.role || "STAFF",
      user_shift: item.users?.shift ?? "PAGI",
      date: item.created_at,
      check_in_time: item.created_at,
      status: item.status,
      method: item.status === "SUCCESS" ? "FACE" : "SKIP",
      latitude: item.latitude,
      longitude: item.longitude,
      accuracy: item.accuracy,
      device: item.device,
      ip_address: item.ip_address,
      face_distance: item.face_distance,
      created_at: item.created_at,
      late_weight: item.late_weight != null ? Number(item.late_weight) : null,
    }));

    return NextResponse.json({ success: true, data: formattedData });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

// DELETE — tetap full-access only (hapus record wajah)
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !isFullAccess(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, message: "ID wajib diisi" }, { status: 400 });
    }

    const { data: record, error: checkError } = await supabase
      .from("face_verifications")
      .select("id, user_id")
      .eq("id", id)
      .maybeSingle();

    if (checkError || !record) {
      return NextResponse.json({ success: false, message: "Record tidak ditemukan" }, { status: 404 });
    }

    const { error } = await supabase
      .from("face_verifications")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[attendance DELETE] error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[attendance DELETE] Exception:", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Unknown error" }, { status: 500 });
  }
}