import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, isFullAccess } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/activityLogger";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizeEmbedding(arr: number[]): number[] {
  const norm = Math.sqrt(arr.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return arr;
  return arr.map((val) => val / norm);
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const user = await verifyToken(token);
    if (!user) {
      return NextResponse.json({ success: false, message: "Token invalid" }, { status: 401 });
    }

    const body = await request.json();
    const { embedding } = body as { embedding: number[] };

    if (
      !embedding ||
      !Array.isArray(embedding) ||
      embedding.length !== 128 ||
      !embedding.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      return NextResponse.json(
        { success: false, message: "Embedding tidak valid (harus 128 angka desimal valid)" },
        { status: 400 }
      );
    }

    // ⛔ KEAMANAN KETAT: Cek apakah user sudah memiliki data wajah terdaftar
    const { data: currentUser, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, name, role, roles, face_embedding")
      .eq("id", user.id)
      .single();

    if (userError || !currentUser) {
      return NextResponse.json({ success: false, message: "User tidak ditemukan" }, { status: 404 });
    }

    if (currentUser.face_embedding) {
      return NextResponse.json(
        {
          success: false,
          message: "Wajah untuk akun ini sudah terdaftar. 1 akun hanya boleh memiliki 1 data wajah. Reset wajah hanya dapat dilakukan oleh Admin.",
          code: "ALREADY_ENROLLED",
        },
        { status: 403 }
      );
    }

    const normalized = normalizeEmbedding(embedding);

    const { error } = await supabaseAdmin
      .from("users")
      .update({
        face_embedding: normalized,
        face_enrolled_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      console.error("Face enroll error:", error);
      return NextResponse.json(
        { success: false, message: "Gagal menyimpan data wajah" },
        { status: 500 }
      );
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "Unknown";
    await logActivity({
      userId: user.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: "CREATE",
      entity: "user",
      entityId: user.id,
      entityLabel: "Pendaftaran Wajah Pertama Kali",
      reason: `Pendaftaran data biometrik wajah terkunci permanen. IP: ${ip}`,
    });

    return NextResponse.json({ success: true, message: "Wajah berhasil didaftarkan dan dikunci ke akun ini" });
  } catch (err) {
    console.error("Face enroll exception:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ success: false }, { status: 401 });

    const admin = await verifyToken(token);
    const userRoles: string[] = Array.isArray((admin as any)?.roles)
      ? (admin as any).roles
      : [admin?.role].filter(Boolean);

    const hasAdminAccess = isFullAccess(admin?.role) || userRoles.some(isFullAccess);
    if (!admin || !hasAdminAccess) {
      return NextResponse.json({ success: false, message: "Hanya Admin yang berhak mereset data wajah user" }, { status: 403 });
    }

    const { user_id } = await request.json();
    if (!user_id) {
      return NextResponse.json({ success: false, message: "user_id wajib diisi" }, { status: 400 });
    }

    const { data: targetUser } = await supabaseAdmin
      .from("users")
      .select("id, name, role")
      .eq("id", user_id)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from("users")
      .update({ face_embedding: null, face_enrolled_at: null })
      .eq("id", user_id);

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "Unknown";
    await logActivity({
      userId: admin.id,
      userName: admin.name,
      userRole: admin.role,
      action: "DELETE",
      entity: "user",
      entityId: user_id,
      entityLabel: `Reset Data Wajah: ${targetUser?.name ?? user_id}`,
      reason: `Admin ${admin.name} mereset data wajah ${targetUser?.name ?? user_id}. IP: ${ip}`,
    });

    return NextResponse.json({ success: true, message: `Face enrollment user ${targetUser?.name ?? ""} berhasil direset` });
  } catch (err) {
    console.error("Face enroll DELETE error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

// ⛔ KEAMANAN KETAT: Tolak PUT (user biasa dilarang mereset wajah sendiri)
export async function PUT() {
  return NextResponse.json(
    {
      success: false,
      message: "Reset data wajah mandiri dinonaktifkan demi keamanan. Silakan hubungi Admin untuk reset wajah.",
      code: "SELF_RESET_FORBIDDEN",
    },
    { status: 403 }
  );
}