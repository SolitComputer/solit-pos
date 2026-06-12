// src/app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

// ─── Cookie list yang harus di-clear ────────────────────────────────────────
const ALL_COOKIES = [
  "token",
  "face_attended",
  "face_verified",
  "attendance_skipped",
  "day_off_today",
];

function clearAllCookies(response: NextResponse) {
  for (const name of ALL_COOKIES) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
}

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
// Self-logout (semua role) — hapus cookie sendiri
export async function POST() {
  const response = NextResponse.json({ success: true });
  clearAllCookies(response);
  return response;
}

// ─── DELETE /api/auth/logout?user_id=xxx ─────────────────────────────────────
// Admin force-logout user tertentu — set force_logout_at di DB
// Saat user request berikutnya, middleware akan detect dan clear cookie mereka
export async function DELETE(request: Request) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || !FULL_ACCESS_ROLES.includes(currentUser.role)) {
      return NextResponse.json(
        { success: false, message: "Akses ditolak" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("user_id");

    if (!targetUserId) {
      return NextResponse.json(
        { success: false, message: "user_id wajib" },
        { status: 400 }
      );
    }

    // Tidak boleh force-logout diri sendiri via endpoint ini
    if (targetUserId === currentUser.id) {
      return NextResponse.json(
        { success: false, message: "Gunakan logout biasa untuk akun sendiri" },
        { status: 400 }
      );
    }

    // Set force_logout_at = sekarang
    // Middleware akan cek: jika iat JWT < force_logout_at → reject token
    const { error } = await supabase
      .from("users")
      .update({ force_logout_at: new Date().toISOString() })
      .eq("id", targetUserId);

    if (error) {
      console.error("[force-logout] DB error:", error);
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    console.log(
      `[force-logout] Admin ${currentUser.name} (${currentUser.id}) force-logout user ${targetUserId}`
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[force-logout] exception:", err);
    return NextResponse.json(
      { success: false, message: err?.message },
      { status: 500 }
    );
  }
}