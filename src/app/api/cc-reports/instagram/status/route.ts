// src/app/api/cc-reports/instagram/status/route.ts
import { NextResponse } from "next/server";
import { getIgHealth, disconnectIg } from "@/lib/ccInstagram";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getIgHealth();
  return NextResponse.json({ success: true, ...health });
}

export async function DELETE() {
  await disconnectIg();
  return NextResponse.json({ success: true });
}