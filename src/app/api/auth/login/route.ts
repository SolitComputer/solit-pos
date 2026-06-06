import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase } from "@/services/supabase";
import { ROLE_DEFAULT_REDIRECT, UserRole } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function parseDevice(ua: string): string {
    if (!ua) return "Unknown Device";
    let os = "Unknown OS";
    let browser = "Unknown Browser";
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

function recordLoginLog(payload: {
    user_id: string | null;
    user_name: string;
    user_role: string;
    user_email: string;
    device: string;
    ip_address: string;
    status: "SUCCESS" | "FAILED";
}) {
    (async () => {
        try {
            await supabaseAdmin.from("login_logs").insert(payload);
        } catch { }
    })();
}

function getMidnightWIB(): Date {
    const nowUTC = new Date();
    const wibMs = nowUTC.getTime() + 7 * 60 * 60 * 1000;
    const nowWIB = new Date(wibMs);
    return new Date(Date.UTC(
        nowWIB.getUTCFullYear(),
        nowWIB.getUTCMonth(),
        nowWIB.getUTCDate() + 1,
        17, 0, 0 
    ));
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password } = body;

        const ua = request.headers.get("user-agent") ?? "";
        const device = parseDevice(ua);
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
            ?? request.headers.get("x-real-ip")
            ?? "Unknown";

        const { data: user, error } = await supabase
            .from("users")
            .select("*")
            .eq("email", email)
            .single();

        if (error || !user) {
            recordLoginLog({
                user_id: null,
                user_name: email ?? "Unknown",
                user_role: "UNKNOWN",
                user_email: email ?? "",
                device,
                ip_address: ip,
                status: "FAILED",
            });
            return NextResponse.json(
                { success: false, message: "Email tidak ditemukan" },
                { status: 400 }
            );
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            recordLoginLog({
                user_id: user.id,
                user_name: user.name,
                user_role: user.role,
                user_email: user.email,
                device,
                ip_address: ip,
                status: "FAILED",
            });
            return NextResponse.json(
                { success: false, message: "Password salah" },
                { status: 400 }
            );
        }

        const token = jwt.sign(
            { id: user.id, name: user.name, role: user.role },
            process.env.JWT_SECRET || "secret",
            { expiresIn: "7d" }
        );

        recordLoginLog({
            user_id: user.id,
            user_name: user.name,
            user_role: user.role,
            user_email: user.email,
            device,
            ip_address: ip,
            status: "SUCCESS",
        });

        const nowUTC = new Date();
        const wibMs = nowUTC.getTime() + 7 * 60 * 60 * 1000;
        const nowWIB = new Date(wibMs);
        const todayDate = nowWIB.toISOString().slice(0, 10); 

        const { data: todaySuccess } = await supabaseAdmin
            .from("face_verifications")
            .select("id")
            .eq("user_id", user.id)
            .eq("status", "SUCCESS")
            .gte("created_at", `${todayDate}T00:00:00+07:00`)
            .lte("created_at", `${todayDate}T23:59:59+07:00`)
            .maybeSingle();

        const todayDow = nowWIB.getUTCDay();
        const [{ data: weeklyOff }, { data: specificOff }] = await Promise.all([
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

        const redirect = ROLE_DEFAULT_REDIRECT[user.role as UserRole] ?? "/dashboard";

        const response = NextResponse.json(
            { success: true, redirect, user: { name: user.name, role: user.role } },
            { status: 200 }
        );

        response.cookies.set("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 7,
        });

        const cookieExpiry = getMidnightWIB();
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax" as const,
            path: "/",
            expires: cookieExpiry,
        };

        if (alreadyAttendedToday) {
            response.cookies.set("face_attended", user.id, cookieOptions);
            response.cookies.set("face_verified", user.id, cookieOptions);
        }

        if (isTodayDayOff) {
            response.cookies.set("day_off_today", user.id, cookieOptions);
        }

        return response;

    } catch (error) {
        console.error("LOGIN ERROR:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}