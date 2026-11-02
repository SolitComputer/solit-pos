import { NextResponse } from "next/server";
import { keepAliveAll } from "@/lib/ccTikTok";

export const dynamic = "force-dynamic";

export async function POST() {
  const results = await keepAliveAll();
  const ok = results.every((r) => r.ok); // true juga kalau belum ada brand terhubung
  return NextResponse.json({ success: ok, results }, { status: 200 });
}