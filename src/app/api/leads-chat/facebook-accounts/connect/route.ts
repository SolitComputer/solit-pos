import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { LEADS_CHAT_MANAGE_ROLES } from "@/lib/permissions";
import { getOAuthDialogUrl } from "@/lib/facebook";
import crypto from "crypto";

async function getHandler(req: NextRequest, ctx: any, user: AuthUser) {
  console.log("[fb-connect] APP_ID kebaca:", process.env.FACEBOOK_APP_ID ? "ADA" : "UNDEFINED/KOSONG");
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/leads-chat/facebook-accounts/callback`;
  const state = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.redirect(getOAuthDialogUrl(redirectUri, state));
  res.cookies.set("fb_oauth_state", state, { httpOnly: true, maxAge: 300, path: "/" });
  return res;
}

export const GET = withAuth(getHandler, LEADS_CHAT_MANAGE_ROLES);