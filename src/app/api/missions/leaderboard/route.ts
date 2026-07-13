// src/app/api/missions/leaderboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

export const dynamic = "force-dynamic";

async function handler(req: NextRequest, _ctx: any, _user: AuthUser) {
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

  const { data: missions, error } = await supabaseAdmin
    .from("missions")
    .select(`
      id, status, created_at, submitted_at, reviewed_at,
      assigned_to,
      assignee:users!missions_assigned_to_fkey(id, name, role, roles)
    `)
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  if (error) {
    console.error("[missions/leaderboard]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const rows = missions ?? [];

  // Data structure: division -> userId -> stats
  const divisions: Record<string, Record<string, {
    name: string;
    role: string;
    totalAssigned: number;
    responseTimes: number[];
    completionTimes: number[];
  }>> = {};

  for (const m of rows) {
    const uid = m.assigned_to;
    if (!uid) continue;

    const assignee = m.assignee as any;
    const name = assignee?.name ?? "—";
    const roles: string[] = assignee?.roles?.length ? assignee.roles : (assignee?.role ? [assignee.role] : []);
    const role = roles[0] ?? "Lainnya"; // Primary division

    if (!divisions[role]) {
      divisions[role] = {};
    }

    if (!divisions[role][uid]) {
      divisions[role][uid] = { name, role, totalAssigned: 0, responseTimes: [], completionTimes: [] };
    }

    divisions[role][uid].totalAssigned++;

    const created = m.created_at ? new Date(m.created_at).getTime() : 0;
    
    // Response time: created_at -> submitted_at
    if (m.submitted_at && created) {
      const ms = new Date(m.submitted_at).getTime() - created;
      if (ms > 0) divisions[role][uid].responseTimes.push(ms);
    }

    // Completion time: created_at -> reviewed_at (for APPROVED)
    if (m.status === "APPROVED" && m.reviewed_at && created) {
      const ms = new Date(m.reviewed_at).getTime() - created;
      if (ms > 0) divisions[role][uid].completionTimes.push(ms);
    }
  }

  // Format response
  const result: Record<string, any[]> = {};

  for (const [div, users] of Object.entries(divisions)) {
    const userStats = Object.entries(users).map(([id, stats]) => {
      const avgResponse = stats.responseTimes.length > 0 
        ? Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length) 
        : null;
        
      const avgCompletion = stats.completionTimes.length > 0
        ? Math.round(stats.completionTimes.reduce((a, b) => a + b, 0) / stats.completionTimes.length)
        : null;

      return {
        id,
        name: stats.name,
        role: stats.role,
        totalAssigned: stats.totalAssigned,
        totalResponded: stats.responseTimes.length,
        totalCompleted: stats.completionTimes.length,
        avgResponseMs: avgResponse,
        avgCompletionMs: avgCompletion
      };
    }).filter(u => u.totalAssigned > 0);

    // Sort by fastest completion, then fastest response
    userStats.sort((a, b) => {
      if (a.avgCompletionMs !== null && b.avgCompletionMs !== null) {
        return a.avgCompletionMs - b.avgCompletionMs;
      }
      if (a.avgCompletionMs !== null) return -1;
      if (b.avgCompletionMs !== null) return 1;
      
      if (a.avgResponseMs !== null && b.avgResponseMs !== null) {
        return a.avgResponseMs - b.avgResponseMs;
      }
      return 0;
    });

    if (userStats.length > 0) {
      result[div] = userStats;
    }
  }

  return NextResponse.json({
    success: true,
    data: result
  });
}

export const GET = withAuth(handler);
