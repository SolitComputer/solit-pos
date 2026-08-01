import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
    getAttendanceExpiry,
    verifyToken,
    calcAttendanceWeightFromSchedule,
    resolveShiftConfigFromDB,
    isAttendanceTimeForSchedule,
    signAttendanceCookie,
} from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { resolveScheduleOverride, toAuthScheduleShape } from "@/lib/shiftSchedule";
import { processAttendanceVerification } from "@/lib/attendanceVerification";
import { verifyAuthenticationResponse, isoBase64URL, RP_ID, ORIGIN, CHALLENGE_TTL_MS } from "@/lib/webauthn";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function parseDevice(ua: string): string {
    if (!ua) return "Unknown Device";
    let os = "Unknown OS", browser = "Unknown Browser";
    if (/Windows NT 10|Windows NT 11/i.test(ua)) os = "Windows 10/11";
    else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
    else if (/Android/i.test(ua)) os = "Android";
    else if (/iPhone/i.test(ua)) os = "iPhone";
    else if (/Linux/i.test(ua)) os = "Linux";
    if (/Edg\//i.test(ua)) browser = "Edge";
    else if (/Chrome\//i.test(ua)) browser = "Chrome";
    else if (/Firefox\//i.test(ua)) browser = "Firefox";
    else if (/Safari\//i.test(ua)) browser = "Safari";
    return `${browser} — ${os}`;
}

async function setAttendanceCookies(response: NextResponse, userId: string, expiry: Date) {
    const opts = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
        expires: expiry,
    };
    const signed = await signAttendanceCookie(userId);
    response.cookies.set("face_verified", signed, opts);
    response.cookies.set("face_attended", signed, opts);
}

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("token")?.value;
        if (!token) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

        const user = await verifyToken(token);
        if (!user) return NextResponse.json({ success: false, message: "Token invalid" }, { status: 401 });

       const { data: userRow } = await supabaseAdmin
            .from("users")
            .select("webauthn_challenge, webauthn_challenge_at, shift, biometric_enabled, role, roles")
            .eq("id", user.id)
            .single();

        // ✅ FIX: konsisten dengan register-verify — kalau admin sudah nonaktifkan
        // sidik jari user ini, tolak absen sidik jari meski kredensial lama masih ada.
        if (!userRow?.biometric_enabled) {
            return NextResponse.json(
                { success: false, message: "Sidik jari dinonaktifkan untuk akun ini. Hubungi admin." },
                { status: 403 }
            );
        }

        if (!userRow?.webauthn_challenge) {
            return NextResponse.json({ success: false, message: "Sesi absen belum dimulai. Tekan tombol sidik jari sekali lagi." }, { status: 400 });
        }
        // ✅ FIX konteks: pesan diperjelas karena akar masalahnya adalah TTL
        // kehabisan waktu saat proses daftar+absen numpuk jadi 1 klik (sudah
        // dipisah di halaman /biometric-enroll — lihat perubahan face-verify).
        if (Date.now() - new Date(userRow.webauthn_challenge_at).getTime() > CHALLENGE_TTL_MS) {
            return NextResponse.json({ success: false, message: "Sesi absen kedaluwarsa (terlalu lama antara mulai dan scan sidik jari). Coba tekan tombol sidik jari lagi." }, { status: 400 });
        }

        const body = await request.json();
        const { credential: assertionCredential, latitude, longitude, accuracy } = body;
        if (!assertionCredential?.id) {
            return NextResponse.json({ success: false, message: "Data biometrik tidak valid" }, { status: 400 });
        }

        const { data: storedCred } = await supabaseAdmin
            .from("user_webauthn_credentials")
            .select("id, credential_id, public_key, counter, transports")
            .eq("user_id", user.id)
            .eq("credential_id", assertionCredential.id)
            .maybeSingle();

        if (!storedCred) {
            return NextResponse.json({ success: false, message: "Sidik jari tidak dikenali di akun ini", needEnroll: true }, { status: 400 });
        }

        let verification;
        try {
            verification = await verifyAuthenticationResponse({
                response: assertionCredential,
                expectedChallenge: userRow.webauthn_challenge,
                expectedOrigin: ORIGIN,
                expectedRPID: RP_ID,
                credential: {
                    id: storedCred.credential_id,
                    publicKey: isoBase64URL.toBuffer(storedCred.public_key),
                    counter: storedCred.counter,
                    transports: storedCred.transports ?? undefined,
                },
            });
        } catch (err: any) {
            const msg: string = err?.message ?? "";
            console.error("[webauthn auth-verify] verify error:", err?.name, msg);

            let userMessage = "Verifikasi sidik jari gagal — coba scan ulang.";
            if (/origin/i.test(msg)) {
                userMessage = "Domain tidak cocok (origin mismatch). Hubungi programmer.";
            } else if (/rp ?id/i.test(msg)) {
                userMessage = "RP ID tidak cocok dengan konfigurasi server. Hubungi programmer.";
            } else if (/challenge/i.test(msg)) {
                userMessage = "Sesi absen tidak cocok. Tekan tombol sidik jari sekali lagi.";
            } else if (/counter/i.test(msg)) {
                userMessage = "Kredensial sidik jari ini terdeteksi bermasalah (counter tidak valid). Reset sidik jari lalu daftar ulang.";
            }

            return NextResponse.json(
                { success: false, message: userMessage, debugReason: msg || err?.name || "unknown_error" },
                { status: 400 }
            );
        }

        if (!verification.verified) {
            return NextResponse.json({ success: false, message: "Sidik jari tidak cocok" }, { status: 400 });
        }

        await Promise.all([
            supabaseAdmin.from("user_webauthn_credentials")
                .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
                .eq("id", storedCred.id),
            supabaseAdmin.from("users")
                .update({ webauthn_challenge: null, webauthn_challenge_at: null })
                .eq("id", user.id),
        ]);

        const ua = request.headers.get("user-agent") ?? "";
        const device = parseDevice(ua);
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "Unknown";

        const result = await processAttendanceVerification({
            supabaseAdmin,
            userId: user.id,
            userRole: (Array.isArray(userRow.roles) && userRow.roles[0]) || userRow.role,
            method: "BIOMETRIC",
            device, ip, latitude, longitude, accuracy,
        });

        if (!result.ok) {
            return NextResponse.json({ success: false, message: result.message, code: result.code }, { status: result.status });
        }

        const expiry = getAttendanceExpiry();
        const response = NextResponse.json({
            success: true,
            message: result.message,
            direction: result.direction,
            overtimeDetected: !!result.overtime,
            overtime: result.overtime,
        });
        await setAttendanceCookies(response, user.id, expiry);
        return response;
    } catch (err) {
        console.error("[webauthn auth-verify]", err);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}