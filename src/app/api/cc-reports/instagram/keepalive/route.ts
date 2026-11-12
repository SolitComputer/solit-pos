// src/app/api/cc-reports/instagram/keepalive/route.ts
import { NextResponse } from "next/server";
import { keepAliveIgAll } from "@/lib/ccInstagram";

export const dynamic = "force-dynamic";

// Cron harian: refresh token IG semua brand yang terhubung.
// Selalu balikin 200 + array hasil per-brand, biar 1 brand gagal nggak
// bikin cron overall gagal / di-retry berlebihan.
export async function POST() {
  const results = await keepAliveIgAll();
  return NextResponse.json({ success: true, results });
}

// GET hanya untuk cek manual dari browser (dev).
export async function GET() {
  const results = await keepAliveIgAll();
  return NextResponse.json({ success: true, results });
}