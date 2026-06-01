import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase } from "@/services/supabase";
import { ROLE_DEFAULT_REDIRECT, UserRole } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

// Admin client untuk bypass RLS saat insert login_logs
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Parse browser + OS dari User-Agent ───────────────────────────────────────
function parseDevice(ua: string): string {
    if (!ua) return "Unknown Device";

    let os = "Unknown OS";
    let browser = "Unknown Browser";

    if      (/Windows NT 10|Windows NT 11/i.test(ua)) os = "Windows 10/11";
    else if (/Windows NT 6\.3/i.test(ua))             os = "Windows 8.1";
    else if (/Windows NT 6\.1/i.test(ua))             os = "Windows 7";
    else if (/Macintosh|Mac OS X/i.test(ua))          os = "macOS";
    else if (/Android/i.test(ua))                     os = "Android";
    else if (/iPhone/i.test(ua))                      os = "iPhone";
    else if (/iPad/i.test(ua))                        os = "iPad";
    else if (/Linux/i.test(ua))                       os = "Linux";

    // Urutan penting: Edge & Opera pakai Chrome engine
    if      (/Edg\//i.test(ua))     browser = "Edge";
    else if (/OPR\//i.test(ua))     browser = "Opera";
    else if (/Chrome\//i.test(ua))  browser = "Chrome";
    else if (/Firefox\//i.test(ua)) browser = "Firefox";
    else if (/Safari\//i.test(ua))  browser = "Safari";

    return `${browser} — ${os}`;
}

// ── Catat login log (fire and forget, tidak memblokir response) ───────────────
function recordLoginLog(payload: {
    user_id:    string | null;
    user_name:  string;
    user_role:  string;
    user_email: string;
    device:     string;
    ip_address: string;
    status:     "SUCCESS" | "FAILED";
}) {
    (async () => {
        try {
            await supabaseAdmin.from("login_logs").insert(payload);
        } catch {
            // Non-critical, ignore error
        }
    })();
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password } = body;

        // Ambil device & IP dari request headers
        const ua     = request.headers.get("user-agent") ?? "";
        const device = parseDevice(ua);
        const ip     = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
                    ?? request.headers.get("x-real-ip")
                    ?? "Unknown";

        // ── Cari user ─────────────────────────────────────────────────────────
        const { data: user, error } = await supabase
            .from("users")
            .select("*")
            .eq("email", email)
            .single();

        if (error || !user) {
            // Catat: email tidak ditemukan
            recordLoginLog({
                user_id:    null,
                user_name:  email ?? "Unknown",
                user_role:  "UNKNOWN",
                user_email: email ?? "",
                device,
                ip_address: ip,
                status:     "FAILED",
            });

            return NextResponse.json(
                { success: false, message: "Email tidak ditemukan" },
                { status: 400 }
            );
        }

        // ── Check password ────────────────────────────────────────────────────
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            // Catat: password salah — user ditemukan tapi salah password
            recordLoginLog({
                user_id:    user.id,
                user_name:  user.name,
                user_role:  user.role,
                user_email: user.email,
                device,
                ip_address: ip,
                status:     "FAILED",
            });

            return NextResponse.json(
                { success: false, message: "Password salah" },
                { status: 400 }
            );
        }

        // ── Generate JWT ──────────────────────────────────────────────────────
        const token = jwt.sign(
            { id: user.id, name: user.name, role: user.role },
            process.env.JWT_SECRET || "secret",
            { expiresIn: "7d" }
        );

        console.log("LOGIN SUCCESS:", user.role);

        // ── Catat: login berhasil ─────────────────────────────────────────────
        recordLoginLog({
            user_id:    user.id,
            user_name:  user.name,
            user_role:  user.role,
            user_email: user.email,
            device,
            ip_address: ip,
            status:     "SUCCESS",
        });

        // ── Set cookie & response ─────────────────────────────────────────────
        const redirect = ROLE_DEFAULT_REDIRECT[user.role as UserRole] ?? "/payment/create";

        const response = NextResponse.json(
            {
                success: true,
                redirect,
                user: {
                    name: user.name,
                    role: user.role,
                },
            },
            { status: 200 }
        );

        response.cookies.set("token", token, {
            httpOnly: true,
            secure:   process.env.NODE_ENV === "production",
            sameSite: "lax",
            path:     "/",
            maxAge:   60 * 60 * 24 * 7,
        });

        return response;

    } catch (error) {
        console.error("LOGIN ERROR:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}