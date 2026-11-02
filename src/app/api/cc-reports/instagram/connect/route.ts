// src/app/api/cc-reports/instagram/connect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { seedIgToken } from "@/lib/ccInstagram";
import { normalizeBrand } from "@/lib/ccReports";
import { getCurrentUser } from "@/lib/auth";
import { hasAnyRole, CC_REPORT_MANAGE_ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// POST { brand, token, igUserId } → tukar jadi long-lived & simpan untuk brand tsb.
export async function POST(req: NextRequest) {
  // 🔒 Hanya role pengelola CC yang boleh menyimpan kredensial IG (pola sama
  //    dengan guard is_cancelled di /api/cc-reports/[id]). Dicek di server,
  //    bukan cuma UI, biar tidak bisa di-bypass lewat fetch manual.
  const currentUser = await getCurrentUser();
  if (!currentUser || !hasAnyRole(currentUser.roles ?? [currentUser.role], CC_REPORT_MANAGE_ROLES)) {
    return NextResponse.json(
      { success: false, error: "Kamu tidak punya akses untuk menghubungkan Instagram" },
      { status: 403 }
    );
  }

  let body: { brand?: string; token?: string; igUserId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body tidak valid" }, { status: 400 });
  }

  const brand = normalizeBrand(body.brand);
  const token = String(body.token ?? "").trim();
  const igUserId = String(body.igUserId ?? "").trim();

  if (!token || !igUserId) {
    return NextResponse.json(
      { success: false, error: "Token dan IG User ID wajib diisi" },
      { status: 400 }
    );
  }

  const out = await seedIgToken(brand, token, igUserId);
  if (!out.ok) {
    return NextResponse.json({ success: false, error: out.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, brand, accountName: out.accountName ?? null });
}