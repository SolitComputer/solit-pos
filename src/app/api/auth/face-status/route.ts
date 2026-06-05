import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const ATTENDANCE_START_HOUR = 7;
const ATTENDANCE_START_MIN  = 30;
const ATTENDANCE_END_HOUR   = 12;
const ATTENDANCE_END_MIN    = 0;

function getMidnightWIB(): Date {
    const nowUTC = new Date();
    const wibMs  = nowUTC.getTime() + 7 * 60 * 60 * 1000;
    const nowWIB = new Date(wibMs);
    return new Date(Date.UTC(
        nowWIB.getUTCFullYear(),
        nowWIB.getUTCMonth(),
        nowWIB.getUTCDate() + 1,
        17, 0, 0
    ));
}

export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("token")?.value;
        if (!token) return NextResponse.json({ success: false, needLogin: true });

        const user = await verifyToken(token);
        if (!user) return NextResponse.json({ success: false, needLogin: true });

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // ── Cookie checks ─────────────────────────────────────────────────────
        const faceVerified = cookieStore.get("face_verified")?.value;
        const faceAttended = cookieStore.get("face_attended")?.value;
        const skipCookie   = cookieStore.get("attendance_skipped")?.value;
        const dayOffCookie = cookieStore.get("day_off_today")?.value;

        const alreadyFromCookie =
            faceVerified  === user.id ||
            faceAttended  === user.id ||
            skipCookie    === user.id ||
            dayOffCookie  === user.id;

        // ── Waktu WIB ────────────────────────────────────────────────────────
        const nowUTC      = new Date();
        const wibMs       = nowUTC.getTime() + 7 * 60 * 60 * 1000;
        const nowWIB      = new Date(wibMs);
        const todayDow    = nowWIB.getUTCDay();                   // 0=Min..6=Sab
        const todayDate   = nowWIB.toISOString().slice(0, 10);   // YYYY-MM-DD

        // ── Cek libur: mingguan + tanggal spesifik secara paralel ────────────
        const [{ data: weeklyOff }, { data: specificOff }] = await Promise.all([
            supabase
                .from("user_day_off")
                .select("id")
                .eq("user_id", user.id)
                .eq("day_of_week", todayDow)
                .maybeSingle(),
            supabase
                .from("user_date_off")
                .select("id")
                .eq("user_id", user.id)
                .eq("off_date", todayDate)
                .maybeSingle(),
        ]);

        const isTodayDayOff = Boolean(weeklyOff) || Boolean(specificOff);

        // ── Cek jam absen ────────────────────────────────────────────────────
        const total = nowWIB.getUTCHours() * 60 + nowWIB.getUTCMinutes();
        const start = ATTENDANCE_START_HOUR * 60 + ATTENDANCE_START_MIN;
        const end   = ATTENDANCE_END_HOUR   * 60 + ATTENDANCE_END_MIN;
        const isAttendanceTime = total >= start && total <= end;

        // ── Cek face enrollment ──────────────────────────────────────────────
        const { data: userData } = await supabase
            .from("users")
            .select("face_embedding")
            .eq("id", user.id)
            .single();

        const needEnroll    = !userData?.face_embedding;
        const alreadyAttended = alreadyFromCookie || isTodayDayOff;

        const response = NextResponse.json({
            success: true,
            alreadyAttended,
            needEnroll,
            isAttendanceTime,
            isTodayDayOff,
        });

        // ── Set cookie day_off_today jika belum ada ──────────────────────────
        if (isTodayDayOff && dayOffCookie !== user.id) {
            const expiry = getMidnightWIB();
            response.cookies.set("day_off_today", user.id, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/",
                expires: expiry,
            });
        }

        return response;
    } catch (error) {
        console.error(error);
        return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
    }
}

export async function POST() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("token")?.value;
        if (!token) return NextResponse.json({ success: false }, { status: 401 });

        const user = await verifyToken(token);
        if (!user) return NextResponse.json({ success: false }, { status: 401 });

        const nowUTC  = new Date();
        const wibMs   = nowUTC.getTime() + 7 * 60 * 60 * 1000;
        const nowWIB  = new Date(wibMs);
        const midnight = new Date(Date.UTC(
            nowWIB.getUTCFullYear(),
            nowWIB.getUTCMonth(),
            nowWIB.getUTCDate() + 1,
            17, 0, 0
        ));

        const response = NextResponse.json({ success: true });
        response.cookies.set("attendance_skipped", user.id, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            expires: midnight,
        });
        return response;
    } catch {
        return NextResponse.json({ success: false }, { status: 500 });
    }
}