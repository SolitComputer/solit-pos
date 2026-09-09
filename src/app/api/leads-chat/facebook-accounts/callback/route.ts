import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { exchangeCodeForUserToken, exchangeForLongLivedUserToken, getManagedPages, subscribePageToWebhook } from "@/lib/facebook";

// Route ini dipanggil langsung oleh redirect Facebook, bukan fetch() dari sisi kita —
// makanya TIDAK dibungkus withAuth. Otorisasi dijamin lewat state cookie yang cuma
// ada kalau user sebelumnya lewat /connect (yang sudah ber-auth).
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const savedState = req.cookies.get("fb_oauth_state")?.value;

  if (searchParams.get("error")) return NextResponse.redirect(`${appUrl}/dashboard/leads-chat?fb_error=denied`);
  if (!code || !state || state !== savedState) return NextResponse.redirect(`${appUrl}/dashboard/leads-chat?fb_error=invalid_state`);

  try {
    const redirectUri = `${appUrl}/api/leads-chat/facebook-accounts/callback`;
    const shortLived = await exchangeCodeForUserToken(code, redirectUri);
    const longLived = await exchangeForLongLivedUserToken(shortLived);
    const pages = await getManagedPages(longLived);

    if (pages.length === 0) return NextResponse.redirect(`${appUrl}/dashboard/leads-chat?fb_error=no_pages`);

    for (const page of pages) {
      await subscribePageToWebhook(page.id, page.access_token).catch((err) =>
        console.error(`[fb-callback] gagal subscribe Page ${page.id}:`, err)
      );
      await supabaseAdmin.from("facebook_accounts").upsert(
        { label: page.name, page_id: page.id, page_access_token: page.access_token, status: "connected", connected_at: new Date().toISOString() },
        { onConflict: "page_id" }
      );
    }

    const res = NextResponse.redirect(`${appUrl}/dashboard/leads-chat?fb_connected=${pages.length}`);
    res.cookies.delete("fb_oauth_state");
    return res;
  } catch (err: any) {
    console.error("[fb-callback] gagal:", err);
    return NextResponse.redirect(`${appUrl}/dashboard/leads-chat?fb_error=exchange_failed`);
  }
}