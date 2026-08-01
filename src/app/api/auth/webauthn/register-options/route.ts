import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { generateRegistrationOptions, RP_NAME, RP_ID, isoUint8Array } from "@/lib/webauthn";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const user = await verifyToken(token);
    if (!user) return NextResponse.json({ success: false, message: "Token invalid" }, { status: 401 });

    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("biometric_enabled, name")
      .eq("id", user.id)
      .single();

    if (!userRow?.biometric_enabled) {
      return NextResponse.json(
        { success: false, message: "Sidik jari belum diaktifkan admin untuk akun ini" },
        { status: 403 }
      );
    }

    const { data: existingCreds } = await supabaseAdmin
      .from("user_webauthn_credentials")
      .select("credential_id, transports")
      .eq("user_id", user.id);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: userRow.name ?? user.name,
      userID: isoUint8Array.fromUTF8String(user.id),
      attestationType: "none",
      excludeCredentials: (existingCreds ?? []).map((c: any) => ({
        id: c.credential_id,
        transports: c.transports ?? undefined,
      })),
     
      authenticatorSelection: {
        residentKey: "discouraged",
        userVerification: "required",
        authenticatorAttachment: "platform",
      },
      
      timeout: 90000,
    });

    await supabaseAdmin
      .from("users")
      .update({ webauthn_challenge: options.challenge, webauthn_challenge_at: new Date().toISOString() })
      .eq("id", user.id);

    return NextResponse.json({ success: true, options });
  } catch (err) {
    console.error("[webauthn register-options]", err);
    return NextResponse.json({ success: false, message: "Gagal membuat opsi pendaftaran" }, { status: 500 });
  }
}