import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { userId, password, confirmPassword } = await request.json();

    if (!userId || !password || !confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Semua field wajib diisi" },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Password tidak cocok" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, message: "Password minimal 6 karakter" },
        { status: 400 }
      );
    }

    // Verifikasi user ada dan memang belum set password
    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, role, password_set")
      .eq("id", userId)
      .single();

    if (error || !user) {
      return NextResponse.json(
        { success: false, message: "User tidak ditemukan" },
        { status: 404 }
      );
    }

    if (user.password_set) {
      return NextResponse.json(
        { success: false, message: "Password sudah pernah diset. Hubungi admin untuk reset." },
        { status: 400 }
      );
    }

    const hashed = await bcrypt.hash(password, 10);

    const { error: updateError } = await supabase
      .from("users")
      .update({ password: hashed, password_set: true })
      .eq("id", userId);

    if (updateError) {
      return NextResponse.json(
        { success: false, message: "Gagal menyimpan password" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Password berhasil dibuat. Silakan login.",
    });
  } catch {
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}