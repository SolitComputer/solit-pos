import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  if (user.role !== "ADMIN") {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, name, email, role, face_enrolled_at, face_embedding")
    .order("role")
    .order("name");

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const users = (data ?? []).map((u: any) => ({
    ...u,
    face_embedding: u.face_embedding !== null && u.face_embedding !== undefined,
  }));

  return NextResponse.json({ success: true, users });
}

export const GET = withAuth(handler);