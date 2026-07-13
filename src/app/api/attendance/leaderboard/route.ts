import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req: NextRequest) => {
  try {
    const url = new URL(req.url);
    const period = url.searchParams.get("period") ?? "today";

    // Define time ranges
    const now = new Date();
    // Jakarta timezone calculation
    now.setHours(now.getHours() + 7);
    let startDate = new Date(now);
    let endDate = new Date(now);

    if (period === "today") {
      startDate.setUTCHours(0, 0, 0, 0);
      endDate.setUTCHours(23, 59, 59, 999);
    } else if (period === "week") {
      const day = startDate.getUTCDay();
      const diff = startDate.getUTCDate() - day + (day === 0 ? -6 : 1);
      startDate.setUTCDate(diff);
      startDate.setUTCHours(0, 0, 0, 0);
      endDate.setUTCHours(23, 59, 59, 999);
    } else if (period === "month") {
      startDate.setUTCDate(1);
      startDate.setUTCHours(0, 0, 0, 0);
      endDate.setUTCMonth(endDate.getUTCMonth() + 1, 0);
      endDate.setUTCHours(23, 59, 59, 999);
    }

    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    // 1. Fetch all non-admin users
    const { data: rawUsers, error } = await supabaseAdmin
      .from("users")
      .select("id, name, role, roles");

    if (error || !rawUsers) throw new Error("Gagal mengambil data user: " + (error?.message || ""));

    const usersData = rawUsers.filter((u) => {
      const name = (u.name || "").toLowerCase();
      return name !== "admin" && name !== "administrator";
    });

    // 2. Fetch face_verifications for the period
    const { data: verifications, error: verifError } = await supabaseAdmin
      .from("face_verifications")
      .select("user_id, created_at, late_weight")
      .in("status", ["SUCCESS"])
      .gte("created_at", startIso)
      .lte("created_at", endIso);

    if (verifError) throw verifError;

    // Process attendance per user (deduplicate by day in WIB)
    const attendanceStats: Record<string, { days: number, onTime: number }> = {};
    const seen = new Set<string>();

    (verifications || []).forEach(v => {
      const wibDate = new Date(new Date(v.created_at).getTime() + 7 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      const key = `${v.user_id}_${wibDate}`;
      if (!seen.has(key)) {
        seen.add(key);
        if (!attendanceStats[v.user_id]) attendanceStats[v.user_id] = { days: 0, onTime: 0 };
        attendanceStats[v.user_id].days++;
        if ((v.late_weight || 0) === 0) {
            attendanceStats[v.user_id].onTime++;
        }
      }
    });

    // Calculate score per user
    const leaderboard = usersData.map((u) => {
      const stats = attendanceStats[u.id] || { days: 0, onTime: 0 };
      let score = stats.days * 10; // 10 points per day attended
      
      let metrics = [];
      if (stats.days > 0) {
          metrics.push({ label: "Hadir", value: stats.days, unit: "hari" });
          metrics.push({ label: "Tepat Waktu", value: stats.onTime, unit: "hari" });
      }

      return {
        id: u.id,
        name: u.name,
        role: u.role,
        photo_url: null,
        score,
        metrics
      };
    });

    // Filter out users with 0 score, then sort
    const activeLeaderboard = leaderboard
      .filter((l) => l.score > 0)
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({ success: true, data: activeLeaderboard });
  } catch (error: any) {
    console.error("Attendance Leaderboard error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
});
