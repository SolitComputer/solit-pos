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

    // ✅ NEW: validasi bentuk data dari browser SEBELUM diproses kriptografi.
    // Kalau field ini kosong, artinya request corrupt/terpotong di jaringan —
    // bukan masalah verifikasi. Pesan jadi tepat sasaran, bukan disamaratakan.
    if (!body?.id || !body?.rawId || !body?.response) {
      return NextResponse.json(
        { success: false, message: "Data pendaftaran dari browser tidak lengkap. Coba ulangi." },
        { status: 400 }
      );
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge: userRow.webauthn_challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
      });
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      console.error("[webauthn register-verify] verifyRegistrationResponse error:", err?.name, msg);

      let userMessage = "Verifikasi gagal — data dari device tidak sesuai dengan sesi pendaftaran ini.";
      if (/origin/i.test(msg)) {
        userMessage = "Domain tidak cocok (origin mismatch). Pastikan dibuka lewat domain resmi, bukan IP atau domain lain.";
      } else if (/rp ?id/i.test(msg)) {
        userMessage = "RP ID tidak cocok dengan konfigurasi server. Hubungi programmer.";
      } else if (/challenge/i.test(msg)) {
        userMessage = "Sesi pendaftaran tidak cocok (challenge berbeda). Ulangi dari awal — jangan buka 2 tab pendaftaran bersamaan.";
      } else if (/algorithm|alg\b/i.test(msg)) {
        userMessage = "Device ini pakai algoritma sidik jari yang tidak didukung server.";
      } else if (/verification/i.test(msg)) {
        userMessage = "Verifikasi pengguna (sidik jari/PIN) tidak terkonfirmasi oleh device. Pastikan benar-benar menyentuh sensor sidik jari sampai selesai.";
      }

      return NextResponse.json(
        { success: false, message: userMessage, debugReason: msg || err?.name || "unknown_error" },
        { status: 400 }
      );
    }

    if (!verification.verified || !verification.registrationInfo) {
      // ✅ NEW: log detail penuh biar kelihatan kenapa "verified" jadi false
      // meski tidak ada exception yang dilempar library.
      console.error("[webauthn register-verify] verified=false:", verification);
      return NextResponse.json(
        { success: false, message: "Sidik jari tidak dapat diverifikasi oleh server. Coba scan ulang, atau gunakan jari/perangkat lain." },
        { status: 400 }
      );
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
  } catch (err: any) {
    console.error("[webauthn register-verify] unhandled error:", err?.name, err?.message, err);
    return NextResponse.json(
      { success: false, message: "Gagal memproses pendaftaran karena error internal server.", debugReason: err?.message ?? "unknown" },
      { status: 500 }
    );
  }
}