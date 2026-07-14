// src/app/api/cc-reports/instagram/keepalive/route.ts
import { NextResponse } from "next/server";
import { keepAliveIg } from "@/lib/ccInstagram";

export const dynamic = "force-dynamic";

export async function POST() {
  const out = await keepAliveIg();
  return NextResponse.json(
    {
      success: out.ok,
      error: out.error ?? null,
      accountName: out.accountName ?? null,
      daysLeft: out.daysLeft ?? null,
    },
    { status: out.ok ? 200 : 500 }
  );
}