// src/app/api/auth/face-verify/route.ts
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
import { logActivity } from "@/lib/activityLogger";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizeEmbedding(arr: number[]): number[] {
  const norm = Math.sqrt(arr.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return arr;
  return arr.map((val) => val / norm);
}

function euclideanDistance(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
}

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

    const body = await request.json();
    const { embedding, attemptCount = 1, latitude, longitude, accuracy } = body;

    // Validasi embedding: harus array 128 angka valid (finite). Tanpa ini,
    // `embedding: []` bikin euclideanDistance = 0 → dianggap match → bypass
    // verifikasi wajah.
    if (
      !Array.isArray(embedding) ||
      embedding.length !== 128 ||
      !embedding.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      return NextResponse.json({ success: false, message: "Data wajah tidak valid" }, { status: 400 });
    }

    const { data: userFullData } = await supabaseAdmin
      .from("users").select("face_embedding, role, roles").eq("id", user.id).single();

    if (!userFullData?.face_embedding) {
      return NextResponse.json({ success: false, message: "Wajah belum terdaftar", needEnroll: true }, { status: 400 });
    }

    // ⛔ KEAMANAN: L2 Normalize + threshold + CROSS-CHECK 1:N (anti tukar wajah)
    // ✅ FIX: 0.40 terlalu ketat utk tinyFaceDetector + averaged embedding —
    // wajah pemilik sendiri sering salah-tolak saat cahaya/sudut sedikit beda
    // (gejala "kadang bisa kadang tidak"). 0.50 adalah ambang wajar face-api.js
    // utk Euclidean pada vektor ter-L2-normalize, masih aman memisah orang beda.
    const THRESHOLD = 0.52;      // jarak MAKS ke wajah SENDIRI (dinaikkan 0.50 → 0.52
                                 // biar wajah sendiri tidak gampang salah-tolak saat
                                 // cahaya/sudut sedikit beda). Keamanan "tukar wajah"
                                 // TIDAK bergantung angka ini — itu dijaga cross-check (2).
    // ✅ FIX: margin pembeda SWAP. Akun lain baru dianggap mencurigakan kalau
    // jaraknya LEBIH DEKAT dari akun sendiri minimal sebesar margin ini.
    const SWAP_MARGIN = 0.05;

     const normInput = normalizeEmbedding(embedding);
    const normStored = normalizeEmbedding(userFullData.face_embedding);
    const distanceSelf = euclideanDistance(normInput, normStored);
    // ✅ Log jarak nyata — pakai angka ini utk kalibrasi THRESHOLD per karyawan.
    // Lihat di `pm2 logs` saat seseorang gagal/berhasil absen.
    console.log(`[face-verify] userId=${user.id} distanceSelf=${distanceSelf.toFixed(3)} (threshold ${THRESHOLD})`);

    // ✅ Dideklarasi di sini supaya bisa dipakai untuk mencatat percobaan GAGAL
    // (gate 1 & gate 2) maupun saat absen berhasil di bawah.
    const ua = request.headers.get("user-agent") ?? "";
    const device = parseDevice(ua);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "Unknown";

    // (1) Wajah harus cukup dekat ke akun SENDIRI
    if (distanceSelf >= THRESHOLD) {
      // ✅ NEW — catat percobaan gagal yang PERSISTEN (percobaan ke-3 ke atas),
      // supaya "katanya muka sendiri tapi ditolak" bisa ditelusuri dari log.
      // Percobaan 1–2 (noise frame) sengaja tidak dicatat biar log tidak banjir.
      if (Number(attemptCount) >= 3) {
        await logActivity({
          userId: user.id, userName: user.name, userRole: user.role,
          action: "CREATE", entity: "attendance",
          entityLabel: "Verifikasi wajah GAGAL — wajah sendiri tidak terdeteksi cocok",
          reason: `distanceSelf=${distanceSelf.toFixed(3)} (batas ${THRESHOLD}). Percobaan ke-${attemptCount}. Device: ${device}. IP: ${ip}`,
        }).catch(() => {});
      }
      return NextResponse.json(
        { success: false, message: "Wajah tidak cocok dengan akun ini. Pastikan akun tidak tertukar.", distance: distanceSelf, code: "FACE_MISMATCH" },
        { status: 400 }
      );
    }

    // Ambil SEMUA wajah terdaftar milik user LAIN untuk cross-check identitas.
    const { data: otherFaces } = await supabaseAdmin
      .from("users")
      .select("id, name, face_embedding")
      .neq("id", user.id)
      .not("face_embedding", "is", null);

    let closestOther: { id: string; name: string; distance: number } | null = null;
    for (const other of otherFaces ?? []) {
      if (!Array.isArray(other.face_embedding) || other.face_embedding.length !== 128) continue;
      const d = euclideanDistance(normInput, normalizeEmbedding(other.face_embedding));
      if (!closestOther || d < closestOther.distance) {
        closestOther = { id: other.id, name: other.name, distance: d };
      }
    }

    // (2) Tolak HANYA kalau akun lain JELAS lebih cocok daripada akun sendiri —
    // inilah penjaga "tukar wajah" (orang B absen pakai akun A HARUS gagal).
    // Membedakan dua kasus yang jaraknya sama-sama kecil:
    //  • Pemilik yang kebetulan mirip orang lain (Yulfa vs Bilqis): jarak ke
    //    akun sendiri ≈ jarak ke akun lain (beda tipis) → LOLOS.
    //  • Orang lain pakai akun ini (swap): wajahnya pasti JAUH lebih cocok ke
    //    akun dia sendiri (≈0) ketimbang ke akun ini → DITOLAK.
    if (closestOther && closestOther.distance + SWAP_MARGIN < distanceSelf) {
      console.warn(
        `[face-verify] DITOLAK (swap) — wajah jauh lebih cocok ke ${closestOther.name} (${closestOther.distance.toFixed(3)}) daripada pemilik akun (${distanceSelf.toFixed(3)}). userId=${user.id}`
      );
      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "CREATE", entity: "attendance",
        entityLabel: "Verifikasi wajah DITOLAK — terindikasi tukar wajah",
        reason: `Wajah lebih cocok ke ${closestOther.name} (${closestOther.distance.toFixed(3)}) daripada akun sendiri (${distanceSelf.toFixed(3)}). Device: ${device}. IP: ${ip}`,
      }).catch(() => {});
      return NextResponse.json(
        {
          success: false,
          message: "Wajah ini terdeteksi milik akun lain, bukan akun Anda. Absen wajib memakai wajah pemilik akun.",
          code: "FACE_BELONGS_TO_OTHER",
          conflictName: closestOther.name,
        },
        { status: 403 }
      );
    }

    const distance = distanceSelf; // dipakai lagi di response sukses di bawah

    // ✅ Semua logika arah IN/OUT + deteksi lembur otomatis ada di sini,
    // jadi face-verify, webauthn, dan absen-pulang-manual admin semuanya
    // konsisten (poin 1, 2, 7, 12, 13, 16).
    const result = await processAttendanceVerification({
      supabaseAdmin,
      userId: user.id,
      userRole: (Array.isArray(userFullData.roles) && userFullData.roles[0]) || userFullData.role,
      method: "FACE",
      device,
      ip,
      latitude, longitude, accuracy,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message, code: result.code }, { status: result.status });
    }

    const expiry = getAttendanceExpiry();
    const response = NextResponse.json({
      success: true,
      message: result.message,
      direction: result.direction,
      distance,
      overtimeDetected: !!result.overtimeOptions,
      overtimeOptions: result.overtimeOptions,
    });
    // Cookie "sudah absen hari ini" tetap dipasang setelah OUT juga, supaya
    // halaman lain (middleware, sidebar) tahu sesi absen hari ini sudah selesai.
    await setAttendanceCookies(response, user.id, expiry);
    return response;
  } catch (err: any) {
    console.error("EXCEPTION di face-verify POST:", err);
    return NextResponse.json(
      { success: false, message: `Internal server error: ${err?.message ?? "unknown error"}` },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ success: false }, { status: 401 });

    const user = await verifyToken(token);
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const expiry = getAttendanceExpiry();
    const response = NextResponse.json({ success: true, message: "Dilanjutkan tanpa absen" });

    response.cookies.set("attendance_skipped", await signAttendanceCookie(user.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      expires: expiry,
    });

    // ✅ SECURITY FIX: dulu skip absen wajah tidak tercatat sama sekali —
    // jadi tidak ada jejak siapa yang skip dan kapan. Sekarang dicatat ke
    // activity_logs supaya bisa diaudit.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "Unknown";
    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "CREATE",
      entity: "attendance",
      entityLabel: "Skip verifikasi wajah",
      reason: `Absen dilanjutkan tanpa verifikasi wajah. IP: ${ip}`,
    });

    return response;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}