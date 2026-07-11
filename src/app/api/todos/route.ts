import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyToken } from "@/lib/auth";

const TODO_ROLES = ["ADMIN", "PROGRAMMER"];

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

async function getAuthedUser(request: NextRequest) {
    const token = request.cookies.get("token")?.value;
    if (!token) return null;
    const user = await verifyToken(token);
    if (!user) return null;
    const roles: string[] = (user as any).roles ?? [user.role];
    const hasAccess = roles.some((r) => TODO_ROLES.includes(r));
    if (!hasAccess) return null;
    return user;
}

// GET /api/todos — fetch semua todo milik user
export async function GET(request: NextRequest) {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter"); // "all" | "active" | "done"
    const priority = searchParams.get("priority"); // "low" | "medium" | "high"

    const supabase = getSupabase();
    let query = supabase
        .from("todos")
        .select("*")
        .eq("user_id", user.id)
        .order("is_done", { ascending: true })
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false });

    if (filter === "active") query = query.eq("is_done", false);
    if (filter === "done") query = query.eq("is_done", true);
    if (priority) query = query.eq("priority", priority);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ todos: data });
}

// POST /api/todos — create todo baru
export async function POST(request: NextRequest) {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const body = await request.json();
    const { title, description, priority, due_date } = body;

    if (!title?.trim()) {
        return NextResponse.json({ error: "Judul tidak boleh kosong" }, { status: 400 });
    }
    if (title.trim().length > 200) {
        return NextResponse.json({ error: "Judul maksimal 200 karakter" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
        .from("todos")
        .insert({
            user_id: user.id,
            title: title.trim(),
            description: description?.trim() || null,
            priority: ["low", "medium", "high"].includes(priority) ? priority : "medium",
            due_date: due_date || null,
        })
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ todo: data }, { status: 201 });
}