import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase } from "@/services/supabase";
import { ROLE_DEFAULT_REDIRECT, UserRole } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

// Admin client untuk insert login_logs (bypass RLS)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Helper: parse device dari User-Agent ──────────────────────────────────────
function parseDevice(ua: string): string {
    if (!ua) return "Unknown Device";

    let os = "Unknown OS";
    let browser = "Unknown Browser";

    // OS
    if      (/Windows NT 10|Windows NT 11/i.test(ua)) os = "Windows 10/11";
    else if (/Windows NT 6\.3/i.test(ua))             os = "Windows 8.1";
    else if (/Windows NT 6\.1/i.test(ua))             os = "Windows 7";
    else if (/Macintosh|Mac OS X/i.test(ua))          os = "macOS";
    else if (/Android/i.test(ua))                     os = "Android";
    else if (/iPhone/i.test(ua))                      os = "iPhone";
    else if (/iPad/i.test(ua))                        os = "iPad";
    else if (/Linux/i.test(ua))                       os = "Linux";

    // Browser (urutan penting — Edge & Opera pakai Chrome engine)
    if      (/Edg\//i.test(ua))    browser = "Edge";
    else if (/OPR\//i.test(ua))    browser = "Opera";
    else if (/Chrome\//i.test(ua)) browser = "Chrome";
    else if (/Firefox\//i.test(ua))browser = "Firefox";
    else if (/Safari\//i.test(ua)) browser = "Safari";

    return `${browser} — ${os}`;
}

// ── Helper: ambil IP dari header ──────────────────────────────────────────────
function getIp(request: Request): string {
    // Next.js headers() tidak tersedia di Route Handler biasa, pakai request.headers
    const forwarded = (request.headers as any).get?.("x-forwarded-for")
                   ?? (request.headers as Headers).get("x-forwarded-for");
    const realIp    = (request.headers as Headers).get("x-real-ip");
    return forwarded?.split(",")[0]?.trim() ?? realIp ?? "Unknown";
}

function recordLoginLog(payload: {
    user_id:    string | null;
    user_name:  string;
    user_role:  string;
    user_email: string;
    device:     string;
    ip_address: string;
    status:     "SUCCESS" | "FAILED";
}) {
    // Wrap Promise.resolve agar TypeScript mengenali sebagai Promise penuh
    void Promise.resolve(
        supabaseAdmin.from("login_logs").insert(payload)
    ).catch(() => {});
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password } = body;

        // Info device & IP diambil sekali di awal
        const ua     = (request.headers as Headers).get("user-agent") ?? "";
        const device = parseDevice(ua);
        const ip     = getIp(request);

        // ── Cari user ─────────────────────────────────────────────────────────
        const { data: user, error } = await supabase
            .from("users")
            .select("*")
            .eq("email", email)
            .single();

        if (error || !user) {
            // Catat login gagal — email tidak ditemukan
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
            // Catat login gagal — password salah
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

        // ── Catat login berhasil ──────────────────────────────────────────────
        recordLoginLog({
            user_id:    user.id,
            user_name:  user.name,
            user_role:  user.role,
            user_email: user.email,
            device,
            ip_address: ip,
            status:     "SUCCESS",
        });

        // ── Response & cookie ─────────────────────────────────────────────────
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