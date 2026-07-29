import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const GET = withAuth(
  async (req: NextRequest, _ctx, user) => {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "20");
    const entity = searchParams.get("entity");
    const action = searchParams.get("action");
    const userName = searchParams.get("user_name");
    const dateFrom = searchParams.get("date_from"); // format: YYYY-MM-DD
    const dateTo = searchParams.get("date_to");     // format: YYYY-MM-DD
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("activity_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (entity) query = query.eq("entity", entity);
    if (entity) query = query.eq("entity", entity);
    if (action) query = query.eq("action", action);
    if (userName) query = query.ilike("user_name", `%${userName}%`);
    if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00+07:00`);
    if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59+07:00`);

    const { data, error, count } = await query;

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ logs: data, total: count, page, limit });
  },
  ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING"] // ✅ tambah ACCOUNTING
);