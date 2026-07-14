import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import { getJwtSecret } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { setupToken, password, confirmPassword } = await request.json();

    if (!setupToken || !password || !confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Semua field wajib diisi" },
        { status: 400 }
      );
    }

    // Validasi token setup — satu-satunya sumber userId yang tepercaya.
    let userId: string;
    try {
      const payload = jwt.verify(setupToken, getJwtSecret()) as {
        sub?: string;
        purpose?: string;
      };
      if (payload.purpose !== "set_password" || !payload.sub) {
        throw new Error("invalid token");
      }
      userId = payload.sub;
    } catch {
      return NextResponse.json(
        { success: false, message: "Sesi setup tidak valid atau kedaluwarsa. Silakan login ulang." },
        { status: 401 }
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