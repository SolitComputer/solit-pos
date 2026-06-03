import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, getFaceVerifiedExpiry } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function euclideanDistance(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
}

function parseDevice(ua: string): string {
  if (!ua) return "Unknown Device";
  let os = "Unknown OS";
  let browser = "Unknown Browser";
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

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const user = await verifyToken(token);
    if (!user) {
      return NextResponse.json({ success: false, message: "Token invalid" }, { status: 401 });
    }

    const body = await request.json();
    const { embedding, attemptCount = 1 } = body as {
      embedding: number[];
      attemptCount?: number;
    };

    const ua = request.headers.get("user-agent") ?? "";
    const device = parseDevice(ua);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? request.headers.get("x-real-ip")
      ?? "Unknown";

    // Ambil stored embedding
    const { data: userData, error } = await supabaseAdmin
      .from("users")
      .select("face_embedding")
      .eq("id", user.id)
      .single();

    if (error || !userData?.face_embedding) {
      return NextResponse.json(
        { success: false, message: "Wajah belum terdaftar", needEnroll: true },
        { status: 400 }
      );
    }

    if (!embedding || !Array.isArray(embedding) || embedding.length !== 128) {
      return NextResponse.json(
        { success: false, message: "Embedding tidak valid" },
        { status: 400 }
      );
    }

    const THRESHOLD = 0.45;
    const distance = euclideanDistance(embedding, userData.face_embedding);
    const matched = distance < THRESHOLD;

    supabaseAdmin.from("face_verifications").insert({
      user_id: user.id,
      status: matched ? "SUCCESS" : "FAILED",
      attempt_count: attemptCount,
      device,
      ip_address: ip,
    }).then(() => {});

    if (!matched) {
      return NextResponse.json(
        { success: false, message: "Wajah tidak dikenali", distance },
        { status: 400 }
      );
    }

    const expiry = getFaceVerifiedExpiry();

    const response = NextResponse.json({
      success: true,
      message: "Verifikasi wajah berhasil",
    });

    response.cookies.set("face_verified", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiry,
    });

    return response;
  } catch (err) {
    console.error("Face verify exception:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const user = await verifyToken(token);
    if (!user) {
      return NextResponse.json({ success: false, message: "Token invalid" }, { status: 401 });
    }

    const ua = request.headers.get("user-agent") ?? "";
    const device = parseDevice(ua);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? request.headers.get("x-real-ip") ?? "Unknown";

    // Log sebagai manual skip
    supabaseAdmin.from("face_verifications").insert({
      user_id: user.id,
      status: "SKIPPED_MANUAL",
      attempt_count: 0,
      device,
      ip_address: ip,
    }).then(() => {});

    const expiry = getFaceVerifiedExpiry();

    const response = NextResponse.json({ success: true });
    response.cookies.set("face_verified", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiry,
    });

    return response;
  } catch {
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}