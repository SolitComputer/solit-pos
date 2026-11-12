// src/app/api/cc-reports/instagram/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIgHealth, getIgHealthAll, disconnectIg } from "@/lib/ccInstagram";
import { normalizeBrand } from "@/lib/ccReports";

export const dynamic = "force-dynamic";

// GET /api/cc-reports/instagram/status           → semua brand
// GET /api/cc-reports/instagram/status?brand=X   → satu brand
export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand");

  if (brand) {
    const b = normalizeBrand(brand);
    const h = await getIgHealth(b);
    return NextResponse.json({ success: true, ...h });
  }

  const brands = await getIgHealthAll();
  // Back-compat: sertakan juga field flat brand default (Solit) supaya kode
  // lama yang masih baca j.level / j.accountName tidak langsung pecah.
  const solit = brands["Solit"];
  return NextResponse.json({ success: true, brands, ...solit });
}

// DELETE /api/cc-reports/instagram/status?brand=X → putus koneksi 1 brand
export async function DELETE(req: NextRequest) {
  const brand = normalizeBrand(req.nextUrl.searchParams.get("brand"));
  await disconnectIg(brand);
  return NextResponse.json({ success: true, brand });
}