// src/app/api/missions/stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

async function handler(_req: NextRequest, _ctx: any, _user: AuthUser) {
  // 1. All missions with timestamps + user info
  const { data: missions, error } = await supabaseAdmin
    .from("missions")
    .select(`
      id, status, priority, due_date, created_at, submitted_at, reviewed_at,
      assigned_by, assigned_to,
      assigner:users!missions_assigned_by_fkey(id, name, role, roles),
      assignee:users!missions_assigned_to_fkey(id, name, role, roles),
      items:mission_items(is_done)
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[missions/stats]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const rows = missions ?? [];

  // 2. Count by status
  const statusCounts: Record<string, number> = {
    PENDING: 0, IN_PROGRESS: 0, SUBMITTED: 0, REJECTED: 0, APPROVED: 0,
  };
  for (const m of rows) statusCounts[m.status] = (statusCounts[m.status] ?? 0) + 1;

  // 3. Count by priority
  const priorityCounts: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const m of rows) priorityCounts[m.priority] = (priorityCounts[m.priority] ?? 0) + 1;

  // 4. Leaderboard: fastest average completion time (created_at → reviewed_at for APPROVED)
  const userTimes: Record<string, { name: string; role: string; times: number[]; completed: number; total: number }> = {};
  for (const m of rows) {
    const uid = m.assigned_to;
    const name = (m.assignee as any)?.name ?? "—";
    const roles: string[] = (m.assignee as any)?.roles?.length
      ? (m.assignee as any).roles
      : (m.assignee as any)?.role ? [(m.assignee as any).role] : [];
    const role = roles[0] ?? "";

    if (!userTimes[uid]) userTimes[uid] = { name, role, times: [], completed: 0, total: 0 };
    userTimes[uid].total++;

    if (m.status === "APPROVED" && m.reviewed_at && m.created_at) {
      const ms = new Date(m.reviewed_at).getTime() - new Date(m.created_at).getTime();
      if (ms > 0) {
        userTimes[uid].times.push(ms);
        userTimes[uid].completed++;
      }
    }
  }

  const leaderboard = Object.entries(userTimes)
    .filter(([, v]) => v.completed > 0)
    .map(([id, v]) => ({
      id,
      name: v.name,
      role: v.role,
      completed: v.completed,
      total: v.total,
      avgMs: Math.round(v.times.reduce((a, b) => a + b, 0) / v.times.length),
      fastestMs: Math.min(...v.times),
      rate: Math.round((v.completed / v.total) * 100),
    }))
    .sort((a, b) => a.avgMs - b.avgMs);

  // 5. Top assigners (who gives the most missions)
  const assignerMap: Record<string, { name: string; role: string; count: number }> = {};
  for (const m of rows) {
    const uid = m.assigned_by;
    const name = (m.assigner as any)?.name ?? "—";
    const roles: string[] = (m.assigner as any)?.roles?.length
      ? (m.assigner as any).roles
      : (m.assigner as any)?.role ? [(m.assigner as any).role] : [];
    if (!assignerMap[uid]) assignerMap[uid] = { name, role: roles[0] ?? "", count: 0 };
    assignerMap[uid].count++;
  }
  const topAssigners = Object.entries(assignerMap)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 6. Overdue count
  const now = Date.now();
  const overdue = rows.filter(
    m => m.status !== "APPROVED" && m.status !== "REJECTED" && m.due_date && new Date(m.due_date as string).getTime() < now
  ).length;

  // 7. Completion rate overall
  const totalMissions = rows.length;
  const completedMissions = statusCounts.APPROVED;
  const completionRate = totalMissions > 0 ? Math.round((completedMissions / totalMissions) * 100) : 0;

  return NextResponse.json({
    success: true,
    data: {
      total: totalMissions,
      statusCounts,
      priorityCounts,
      overdue,
      completionRate,
      leaderboard: leaderboard.slice(0, 10),
      topAssigners,
    },
  });
}

export const GET = withAuth(handler);
