import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, _ctx, user) => {
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

    // Filter out users named 'Admin'
    const usersData = rawUsers.filter((u) => {
      const name = (u.name || "").toLowerCase();
      return name !== "admin" && name !== "administrator";
    });

    // 2. Fetch parallel aggregated data
    const [
      { data: transactions },
      { data: preparations },
      { data: serviceOrders },
      { data: ccReports },
      { data: cashflows },
      { data: activities },
      { data: missions }
    ] = await Promise.all([
      // Sales: transactions
      supabaseAdmin
        .from("transactions")
        .select("created_by, invoice, total_amount, status")
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .eq("status", "LUNAS"),

      // Penyedia Barang / Pengantaran: preparations (all records to count both creators and preparers)
      supabaseAdmin
        .from("preparation_orders")
        .select("id, order_number, created_by, done_by, status, created_at, done_at")
        .gte("created_at", startIso)
        .lte("created_at", endIso),

      // Teknisi: service
      supabaseAdmin
        .from("service_orders")
        .select("id, status, dikerjakan_by")
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .in("status", ["SELESAI", "BISA_DIAMBIL", "SUDAH_DIAMBIL"]),

      // Konten: cc_reports
      supabaseAdmin
        .from("cc_reports")
        .select("id, created_by_id")
        .gte("created_at", startIso)
        .lte("created_at", endIso),

      // Accounting: cashflow
      supabaseAdmin
        .from("cashflow_entries")
        .select("id, created_by")
        .gte("created_at", startIso)
        .lte("created_at", endIso),

      // Pengelola Barang & Sotech: activity logs for laptops/units creation
      supabaseAdmin
        .from("activity_logs")
        .select("user_id, action, entity")
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .eq("action", "CREATE")
        .in("entity", ["laptop", "unit"]),

      // Missions: (all)
      supabaseAdmin
        .from("missions")
        .select("id, assigned_to, status")
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .eq("status", "DONE")
    ]);

    // Calculate score per user
    const leaderboard = usersData.map((u) => {
      let score = 0;
      let metrics = [];
      const uid = u.id;
      const userRoles = u.roles || [u.role];
      const hasRole = (roleMatch: string) => userRoles.some((r: string) => r && r.includes(roleMatch));

      // TRANSACTIONS (Sales) - Payment & Formats
      const uTransactions = (transactions ?? []).filter((t) => t.created_by === uid);
      const uFormats = (preparations ?? []).filter((p) => p.created_by === uid);
      
      if (uTransactions.length > 0 || uFormats.length > 0 || hasRole("SALES")) {
        score += uTransactions.length * 20; // 20 points per transaction
        score += uFormats.length * 5; // 5 points per format
        metrics.push({ label: "Total Payment", value: uTransactions.length, unit: "trx" });
        metrics.push({ label: "Buat Format", value: uFormats.length, unit: "order" });
      }

      // PREPARATIONS (Penyedia Barang / Pengantaran)
      const uPreparations = (preparations ?? []).filter((p) => p.done_by === uid);
      if (uPreparations.length > 0 || hasRole("PENYEDIA") || hasRole("PENGANTARAN") || hasRole("SOTECH") || hasRole("ONPOINT")) {
        score += uPreparations.length * 15;
        
        let totalSpeedMs = 0;
        let speedCount = 0;
        uPreparations.forEach((p) => {
          if (p.created_at && p.done_at) {
            const ms = new Date(p.done_at).getTime() - new Date(p.created_at).getTime();
            if (ms > 0) {
              totalSpeedMs += ms;
              speedCount++;
            }
          }
        });

        const avgSpeedMinutes = speedCount > 0 ? Math.round((totalSpeedMs / speedCount) / 60000) : 0;
        metrics.push({ label: "Barang Disiapkan", value: uPreparations.length, unit: "unit" });
        metrics.push({ label: "Kecepatan Rata-rata", value: avgSpeedMinutes, unit: "menit" });
      }

      // SERVICE (Teknisi)
      const uServices = (serviceOrders ?? []).filter((s) => s.dikerjakan_by === uid);
      if (uServices.length > 0 || hasRole("TEKNISI")) {
        score += uServices.length * 30;
        metrics.push({ label: "Servis Selesai", value: uServices.length, unit: "unit" });
      }

      // KONTEN (cc_reports)
      const uReports = (ccReports ?? []).filter((c) => c.created_by_id === uid);
      if (uReports.length > 0 || hasRole("KONTEN")) {
        score += uReports.length * 15;
        metrics.push({ label: "Konten Dibuat", value: uReports.length, unit: "doc" });
      }

      // ACCOUNTING (cashflow)
      const uCashflows = (cashflows ?? []).filter((c) => c.created_by === uid);
      if (uCashflows.length > 0 || hasRole("ACCOUNTING")) {
        score += uCashflows.length * 10;
        metrics.push({ label: "Input Cashflow", value: uCashflows.length, unit: "trx" });
      }

      // PENGELOLA BARANG & SOTECH (activity logs)
      const uActivities = (activities ?? []).filter((a) => a.user_id === uid);
      if (uActivities.length > 0 || hasRole("PENGELOLA") || hasRole("SOTECH") || hasRole("ONPOINT")) {
        score += uActivities.length * 5;
        metrics.push({ label: "Data Barang Diinput", value: uActivities.length, unit: "unit" });
      }

      // MISSIONS
      const uMissions = (missions ?? []).filter((m) => m.assigned_to === uid);
      if (uMissions.length > 0) {
        score += uMissions.length * 20;
        metrics.push({ label: "Misi Diselesaikan", value: uMissions.length, unit: "misi" });
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

    // Filter out users with 0 score
    const activeLeaderboard = leaderboard
      .filter((l) => l.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);

    return NextResponse.json({ success: true, data: activeLeaderboard });
  } catch (error: any) {
    console.error("Leaderboard error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
});
