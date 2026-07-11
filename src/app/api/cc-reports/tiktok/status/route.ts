import { NextResponse } from "next/server";
import { getHealth, disconnect } from "@/lib/ccTikTok";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getHealth();
  return NextResponse.json({ success: true, ...health });
}

export async function DELETE() {
  await disconnect();
  return NextResponse.json({ success: true });
}