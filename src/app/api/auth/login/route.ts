import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import { ROLE_DEFAULT_REDIRECT, UserRole, buildTokenPayload, getJwtSecret, signAttendanceCookie } from "@/lib/auth";

// ── Satu instance supabaseAdmin — dipakai di seluruh handler ─────────────────
// Dipindah ke atas agar bisa dipakai untuk clear force_logout_at setelah login
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Alias untuk backward compat (recordLoginLog masih pakai `supabase`)
const supabase = supabaseAdmin;

// ── Kolom yang diambil dari DB ────────────────────────────────────────────────
const USER_SELECT_FIELDS =
    "id, name, phone_number, email, role, roles, shift, password, password_set, face_embedding";

function parseDevice(ua: string): string {
    if (!ua) return "Unknown Device";
    let os = "Unknown OS",
        browser = "Unknown Browser";
    if (/Windows NT 10|Windows NT 11/i.test(ua)) os = "Windows 10/11";
    else if (/Windows NT 6\.3/i.test(ua)) os = "Windows 8.1";
    else if (/Windows NT 6\.1/i.test(ua)) os = "Windows 7";
    else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
    else if (/Android/i.test(ua)) os = "Android";
    else if (/iPhone/i.test(ua)) os = "iPhone";
    else if (/iPad/i.test(ua)) os = "iPad";
    else if (/Linux/i.test(ua)) os = "Linux";
    if (/Edg\//i.test(ua)) browser = "Edge";
    else if (/OPR\//i.test(ua)) browser = "Opera";
    else if (/Chrome\//i.test(ua)) browser = "Chrome";
    else if (/Firefox\//i.test(ua)) browser = "Firefox";
    else if (/Safari\//i.test(ua)) browser = "Safari";
    return `${browser} — ${os}`;
}

function getMidnightWIB(): Date {
    const wib = new Date(Date.now() + 7 * 3600_000);
    return new Date(
        Date.UTC(
            wib.getUTCFullYear(),
            wib.getUTCMonth(),
            wib.getUTCDate() + 1,
            17,
            0,
            0
        )
    );
}

function normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (digits.startsWith("62")) return digits;
    if (digits.startsWith("0")) return "62" + digits.slice(1);
    if (digits.startsWith("8")) return "62" + digits;
    if (digits.length >= 9) return "62" + digits;
    return digits;
}

function recordLoginLog(payload: {
    user_id: string | null;
    user_name: string;
    user_role: string;
    identifier: string;
    device: string;
    ip_address: string;
    status: "SUCCESS" | "FAILED";
}) {
    // fire-and-forget — non-critical
    void (async () => {
        try {
            await supabase.from("login_logs").insert({
                user_id: payload.user_id,
                user_name: payload.user_name,
                user_role: payload.user_role,
                user_email: payload.identifier,
                device: payload.device,
                ip_address: payload.ip_address,
                status: payload.status,
            });
        } catch {
            /* non-critical, biarkan gagal */
        }
    })();
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { phone, email, password } = body;
        const rawIdentifier: string = (phone ?? email ?? "").trim();

        const ua = request.headers.get("user-agent") ?? "";
        const device = parseDevice(ua);
        const ip =
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            request.headers.get("x-real-ip") ??
            "Unknown";

        if (!rawIdentifier || !password) {
            return NextResponse.json(
                { success: false, message: "Nomor WA dan password wajib diisi" },
                { status: 400 }
            );
        }

        // ── Key kanonik untuk rate-limit & log ────────────────────────────────────
        // ✅ SECURITY FIX: dulu lockout & log pakai `rawIdentifier` (teks mentah yang
        // diketik user). Karena lookup user menormalkan nomor HP ke berbagai format
        // (628xxx / 08xxx / 8xxx), penyerang bisa menulis nomor yang SAMA dengan
        // format berbeda tiap percobaan → tiap percobaan jadi "user_email" berbeda,
        // sehingga penghitung 5x-gagal tidak pernah terpenuhi. Sekarang semua format
        // nomor dipetakan ke satu key (628xxx), email di-lowercase, dan key ini
        // dipakai KONSISTEN untuk query hitung maupun saat menyimpan login_logs.
        const looksLikePhone =
            /^[\d\+\s\-\(\)]+$/.test(rawIdentifier) &&
            rawIdentifier.replace(/\D/g, "").length >= 8;
        const lockKey = looksLikePhone
            ? normalizePhone(rawIdentifier)
            : rawIdentifier.toLowerCase();

        // ── Rate-limit brute-force ────────────────────────────────────────────────
        // Blokir kalau ada >= LOCK_THRESHOLD login GAGAL untuk identifier ini dalam
        // LOCK_WINDOW_MIN menit terakhir. Mencegah tebak password tanpa batas.
        const LOCK_WINDOW_MIN = 15;
        const LOCK_THRESHOLD = 5;
        try {
            const windowStart = new Date(
                Date.now() - LOCK_WINDOW_MIN * 60_000
            ).toISOString();
            const { count } = await supabaseAdmin
                .from("login_logs")
                .select("id", { count: "exact", head: true })
                .eq("status", "FAILED")
                .eq("user_email", lockKey)
                .gte("created_at", windowStart);
            if ((count ?? 0) >= LOCK_THRESHOLD) {
                return NextResponse.json(
                    {
                        success: false,
                        message: `Terlalu banyak percobaan gagal. Coba lagi dalam ${LOCK_WINDOW_MIN} menit.`,
                    },
                    { status: 429 }
                );
            }
        } catch {
            // fail-open: kalau cek gagal, jangan block login yang sah
        }

        // ── Cari user: coba phone_number dulu, fallback ke email ─────────────────
        // (looksLikePhone sudah dihitung di atas untuk keperluan lockKey)
        let user: any = null;

        if (looksLikePhone) {
            const normalized = normalizePhone(rawIdentifier); // 628xxx
            const rawDigits = rawIdentifier.replace(/\D/g, ""); // digit mentah
            const withZero = rawDigits.replace(/^62/, "0"); // 08xxx

            const [r1, r2, r3] = await Promise.all([
                supabase
                    .from("users")
                    .select(USER_SELECT_FIELDS)
                    .eq("phone_number", normalized)
                    .maybeSingle(),
                supabase
                    .from("users")
                    .select(USER_SELECT_FIELDS)
                    .eq("phone_number", rawDigits)
                    .maybeSingle(),
                supabase
                    .from("users")
                    .select(USER_SELECT_FIELDS)
                    .eq("phone_number", withZero)
                    .maybeSingle(),
            ]);

            user = r1.data ?? r2.data ?? r3.data ?? null;
        }

        // Fallback ke email
        if (!user) {
            const { data } = await supabase
                .from("users")
                .select(USER_SELECT_FIELDS)
                .eq("email", rawIdentifier)
                .maybeSingle();
            user = data ?? null;
        }

        if (!user) {
            recordLoginLog({
                user_id: null,
                user_name: rawIdentifier,
                user_role: "UNKNOWN",
                identifier: lockKey,
                device,
                ip_address: ip,
                status: "FAILED",
            });
            return NextResponse.json(
                {
                    success: false,
                    message: looksLikePhone
                        ? "Nomor WA tidak ditemukan"
                        : "Email tidak ditemukan",
                },
                { status: 400 }
            );
        }

        // ── Cek password_set ──────────────────────────────────────────────────────
        if (!user.password_set) {
            // Token setup singkat & bertanda tangan. set-password WAJIB memakai
            // token ini, jadi orang yang cuma menebak userId tidak bisa
            // mengambil alih akun yang belum di-onboarding.
            const setupToken = jwt.sign(
                { sub: user.id, purpose: "set_password" },
                getJwtSecret(),
                { expiresIn: "15m" }
            );
            return NextResponse.json({
                success: false,
                needSetPassword: true,
                userId: user.id,
                setupToken,
                message: "Silakan buat password Anda terlebih dahulu",
            });
        }

        // ── Verifikasi password ───────────────────────────────────────────────────
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            recordLoginLog({
                user_id: user.id,
                user_name: user.name,
                user_role: user.role,
                identifier: lockKey,
                device,
                ip_address: ip,
                status: "FAILED",
            });
            return NextResponse.json(
                { success: false, message: "Password salah" },
                { status: 400 }
            );
        }

        try {
            await supabaseAdmin
                .from("users")
                .update({ force_logout_at: null })
                .eq("id", user.id);
        } catch {
            // Non-critical: jangan block login kalau update gagal
            // Middleware punya buffer 5 detik sebagai safety net
        }

        // ── Buat JWT — sertakan shift + roles (multi-role) ────────────────────────
        const userShift = user.shift ?? "PAGI";

        // Normalize roles array dari DB
        // Kolom "roles" adalah text[] di Supabase → bisa null jika user lama belum di-migrate
        const userRolesArray: string[] =
            Array.isArray(user.roles) && user.roles.length > 0
                ? user.roles
                : [user.role];

        const jwtPayload = buildTokenPayload({
            id: user.id,
            name: user.name,
            role: user.role,
            roles: userRolesArray,
            shift: userShift,
        });

        const token = jwt.sign(jwtPayload, getJwtSecret(), {
            expiresIn: "7d",
        });

        recordLoginLog({
            user_id: user.id,
            user_name: user.name,
            user_role: user.role,
            identifier: rawIdentifier,
            device,
            ip_address: ip,
            status: "SUCCESS",
        });

        // ── Cek absensi hari ini ──────────────────────────────────────────────────
        const nowWIB = new Date(Date.now() + 7 * 3600_000);
        const todayDate = nowWIB.toISOString().slice(0, 10);
        const todayDow = nowWIB.getUTCDay();

        const [{ data: todaySuccess }, { data: weeklyOff }, { data: specificOff }] =
            await Promise.all([
                supabaseAdmin
                    .from("face_verifications")
                    .select("id")
                    .eq("user_id", user.id)
                    .eq("status", "SUCCESS")
                    .gte("created_at", `${todayDate}T00:00:00+07:00`)
                    .lte("created_at", `${todayDate}T23:59:59+07:00`)
                    .maybeSingle(),
                supabaseAdmin
                    .from("user_day_off")
                    .select("id")
                    .eq("user_id", user.id)
                    .eq("day_of_week", todayDow)
                    .maybeSingle(),
                supabaseAdmin
                    .from("user_date_off")
                    .select("id")
                    .eq("user_id", user.id)
                    .eq("off_date", todayDate)
                    .maybeSingle(),
            ]);

        const alreadyAttendedToday = Boolean(todaySuccess);
        const isTodayDayOff = Boolean(weeklyOff) || Boolean(specificOff);

        // Redirect berdasarkan primary role (roles[0])
        const primaryRole = (userRolesArray[0] ?? user.role) as UserRole;
        const redirect = ROLE_DEFAULT_REDIRECT[primaryRole] ?? "/dashboard";

        // ── Build response ────────────────────────────────────────────────────────
        const response = NextResponse.json(
            {
                success: true,
                redirect,
                user: {
                    name: user.name,
                    role: primaryRole,
                    roles: userRolesArray,
                },
            },
            { status: 200 }
        );

        response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
        response.headers.set("Pragma", "no-cache");

        // Clear attendance cookies lama
        const attendanceCookiesToClear = [
            "face_attended",
            "face_verified",
            "attendance_skipped",
            "day_off_today",
        ];
        for (const name of attendanceCookiesToClear) {
            response.cookies.set(name, "", {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax" as const,
                path: "/",
                maxAge: 0,
            });
        }

        const cookieExpiry = getMidnightWIB();
        const cookieOpts = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax" as const,
            path: "/",
            expires: cookieExpiry,
        };

        // Set token — berlaku 7 hari
        response.cookies.set("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 7,
        });

        if (alreadyAttendedToday) {
            const signed = await signAttendanceCookie(user.id);
            response.cookies.set("face_attended", signed, cookieOpts);
            response.cookies.set("face_verified", signed, cookieOpts);
        }
        if (isTodayDayOff) {
            response.cookies.set("day_off_today", await signAttendanceCookie(user.id), cookieOpts);
        }

        return response;
    } catch (err) {
        console.error("LOGIN ERROR:", err);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}