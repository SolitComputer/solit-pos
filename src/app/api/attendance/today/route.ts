import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

// Route ini bergantung pada waktu saat request masuk (hari ini),
// jadi jangan biarkan Next.js men-cache hasilnya.
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ShiftBucket = "pagi" | "siang" | "sore";

type AttendanceEntry = {
  user_id: string;
  name: string;
  role: string;
  check_in_time: string;
  method: "FACE";
};

function getWIBHour(iso: string): number {
  const wib = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  return wib.getUTCHours();
}

function bucketFromHour(hour: number): ShiftBucket {
  if (hour < 11) return "pagi";
  if (hour < 15) return "siang";
  return "sore";
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // ── Hitung rentang "hari ini" dengan cutoff 04:00 WIB ─────────────
    // Gunakan WIB (+7) - 4 jam cutoff = +3 jam
    const wibDateStr = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // startUTC = jam 04:00:00 WIB hari ini = jam 21:00:00 UTC kemarin
    const startUTC = new Date(`${wibDateStr}T04:00:00+07:00`);
    
    // endUTC = 24 jam setelah startUTC minus 1 milidetik
    const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

    // ── Ambil absen SUCCESS hari ini saja (bukan semua histori) ────────────
    const { data, error } = await supabase
      .from("face_verifications")
      .select(`
        user_id,
        created_at,
        status,
        direction,
        users!inner ( id, name, role )
      `)
      .eq("status", "SUCCESS")
      .gte("created_at", startUTC.toISOString())
      .lte("created_at", endUTC.toISOString())
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[attendance/today] error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    // ── Dedup: ambil check-in PERTAMA per user hari ini ─────────────────────
    const seen = new Set<string>();
    const merged: AttendanceEntry[] = [];
    (data || []).forEach((item: any) => {
      // ✅ FIX: abaikan absen pulang, kita cuma cari jam masuk (IN)
      if (item.direction === "OUT") return;

      if (seen.has(item.user_id)) return;
      seen.add(item.user_id);
      merged.push({
        user_id: item.user_id,
        name: item.users?.name || "Unknown",
        role: item.users?.role || "STAFF",
        check_in_time: item.created_at,
        method: "FACE",
      });
    });

    // ── Kelompokkan berdasarkan jam masuk WIB ───────────────────────────────
    const grouped: Record<ShiftBucket, AttendanceEntry[]> = { pagi: [], siang: [], sore: [] };
    merged.forEach((item) => {
      grouped[bucketFromHour(getWIBHour(item.check_in_time))].push(item);
    });

    return NextResponse.json({ success: true, data: grouped });
  } catch (err) {
    console.error("[attendance/today] exception:", err);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}