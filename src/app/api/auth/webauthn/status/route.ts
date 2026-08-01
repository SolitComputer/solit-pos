import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Endpoint ringan khusus buat halaman /biometric-enroll — tidak ikut logic
// jadwal/GPS/absen supaya bisa dibuka kapan saja, terlepas dari status absen.
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ success: false }, { status: 401 });

    const user = await verifyToken(token);
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const [{ data: userRow }, { data: creds }] = await Promise.all([
      supabaseAdmin.from("users").select("biometric_enabled").eq("id", user.id).single(),
      supabaseAdmin
        .from("user_webauthn_credentials")
        .select("id, device_label, created_at, last_used_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    return NextResponse.json({
      success: true,
      biometricEligible: Boolean(userRow?.biometric_enabled),
      biometricEnrolled: (creds ?? []).length > 0,
      devices: creds ?? [],
    });
  } catch (err) {
    console.error("[webauthn status]", err);
    return NextResponse.json({ success: false, message: "Gagal memuat status sidik jari" }, { status: 500 });
  }
}