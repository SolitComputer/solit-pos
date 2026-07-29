import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { verifyRegistrationResponse, isoBase64URL, RP_ID, ORIGIN, CHALLENGE_TTL_MS } from "@/lib/webauthn";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function parseDevice(ua: string): string {
  if (!ua) return "Unknown Device";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Macintosh/i.test(ua)) return "macOS";
  if (/Windows/i.test(ua)) return "Windows";
  return "Unknown OS";
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ success: false }, { status: 401 });

    const user = await verifyToken(token);
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("webauthn_challenge, webauthn_challenge_at, biometric_enabled")
      .eq("id", user.id)
      .single();

    if (!userRow?.biometric_enabled) {
      return NextResponse.json({ success: false, message: "Sidik jari belum diaktifkan" }, { status: 403 });
    }
    if (!userRow.webauthn_challenge) {
      return NextResponse.json({ success: false, message: "Tidak ada sesi pendaftaran aktif, ulangi lagi" }, { status: 400 });
    }
    if (Date.now() - new Date(userRow.webauthn_challenge_at).getTime() > CHALLENGE_TTL_MS) {
      return NextResponse.json({ success: false, message: "Sesi pendaftaran kedaluwarsa, ulangi lagi" }, { status: 400 });
    }

    const body = await request.json();

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: userRow.webauthn_challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ success: false, message: "Verifikasi pendaftaran gagal" }, { status: 400 });
    }

    const { credential } = verification.registrationInfo;
    const ua = request.headers.get("user-agent") ?? "";

    const { error: insertError } = await supabaseAdmin
      .from("user_webauthn_credentials")
      .insert({
        user_id: user.id,
        credential_id: credential.id,
        public_key: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        device_label: parseDevice(ua),
        transports: credential.transports ?? null,
      });

    if (insertError) {
      console.error("[webauthn register-verify] insert error:", insertError);
      return NextResponse.json({ success: false, message: "Gagal menyimpan kredensial" }, { status: 500 });
    }

    await supabaseAdmin
      .from("users")
      .update({ webauthn_challenge: null, webauthn_challenge_at: null })
      .eq("id", user.id);

    return NextResponse.json({ success: true, message: "Sidik jari berhasil didaftarkan di device ini" });
  } catch (err) {
    console.error("[webauthn register-verify]", err);
    return NextResponse.json({ success: false, message: "Gagal memverifikasi pendaftaran" }, { status: 500 });
  }
}