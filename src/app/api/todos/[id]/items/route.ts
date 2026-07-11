// C:\Users\SOLIT\Documents\SOLIT_POS\solit-pos\src\app\api\todos\[id]\items\route.ts
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
    if (!roles.some((r) => TODO_ROLES.includes(r))) return null;
    return user;
}

// GET /api/todos/[id]/items — fetch semua checklist items milik todo ini
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { id: todo_id } = await params;
    const supabase = getSupabase();

    // Verifikasi todo milik user ini
    const { data: todo, error: todoErr } = await supabase
        .from("todos")
        .select("id")
        .eq("id", todo_id)
        .eq("user_id", user.id)
        .single();

    if (todoErr || !todo) {
        return NextResponse.json({ error: "Todo tidak ditemukan" }, { status: 404 });
    }

    const { data, error } = await supabase
        .from("todo_items")
        .select("*")
        .eq("todo_id", todo_id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
}

// POST /api/todos/[id]/items — tambah checklist item baru
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { id: todo_id } = await params;
    const body = await request.json();
    const title = String(body.title ?? "").trim();

    if (!title) return NextResponse.json({ error: "Judul item tidak boleh kosong" }, { status: 400 });
    if (title.length > 300) return NextResponse.json({ error: "Judul item terlalu panjang" }, { status: 400 });

    const supabase = getSupabase();

    // Verifikasi todo milik user ini
    const { data: todo, error: todoErr } = await supabase
        .from("todos")
        .select("id")
        .eq("id", todo_id)
        .eq("user_id", user.id)
        .single();

    if (todoErr || !todo) {
        return NextResponse.json({ error: "Todo tidak ditemukan" }, { status: 404 });
    }

    // Ambil posisi tertinggi saat ini + 1
    const { data: last } = await supabase
        .from("todo_items")
        .select("position")
        .eq("todo_id", todo_id)
        .order("position", { ascending: false })
        .limit(1)
        .single();

    const nextPosition = (last?.position ?? -1) + 1;

    const { data, error } = await supabase
        .from("todo_items")
        .insert({
            todo_id,
            user_id: user.id,
            title,
            is_done: false,
            position: nextPosition,
        })
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data }, { status: 201 });
}