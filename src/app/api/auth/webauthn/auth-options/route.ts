import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { generateAuthenticationOptions, RP_ID } from "@/lib/webauthn";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ success: false }, { status: 401 });

    const user = await verifyToken(token);
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("biometric_enabled")
      .eq("id", user.id)
      .single();

    if (!userRow?.biometric_enabled) {
      return NextResponse.json(
        { success: false, message: "Sidik jari dinonaktifkan untuk akun ini. Hubungi admin." },
        { status: 403 }
      );
    }

    const { data: creds } = await supabaseAdmin
      .from("user_webauthn_credentials")
      .select("credential_id, transports")
      .eq("user_id", user.id);

    if (!creds || creds.length === 0) {
      return NextResponse.json(
        { success: false, message: "Belum ada sidik jari terdaftar di akun ini", needEnroll: true },
        { status: 400 }
      );
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: creds.map((c: any) => ({ id: c.credential_id, transports: c.transports ?? undefined })),
      userVerification: "required",
    });

    await supabaseAdmin
      .from("users")
      .update({ webauthn_challenge: options.challenge, webauthn_challenge_at: new Date().toISOString() })
      .eq("id", user.id);

    return NextResponse.json({ success: true, options });
  } catch (err) {
    console.error("[webauthn auth-options]", err);
    return NextResponse.json({ success: false, message: "Gagal membuat opsi autentikasi" }, { status: 500 });
  }
}