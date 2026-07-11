import { NextResponse } from "next/server";
import { keepAlive } from "@/lib/ccTikTok";

export const dynamic = "force-dynamic";

export async function POST() {
  const out = await keepAlive();
  return NextResponse.json(
    { success: out.ok, error: out.error ?? null },
    { status: out.ok ? 200 : 500 }
  );
}