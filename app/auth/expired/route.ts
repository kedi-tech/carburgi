import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { renewTokens } from "@/lib/auth-tokens";
import { clearSession, readRefreshToken, storeTokens } from "@/lib/session";

/**
 * Where a token the API rejected lands.
 *
 * Cookies can only be written from a Route Handler or a Server Action — never
 * while a page renders — so `lib/api.ts` redirects here on a 401. One renewal
 * is tried first (the proxy renews ahead of expiry, but a token can still be
 * refused early); if it works, the administrator goes straight back to the
 * page they asked for. Otherwise the session is cleared and they sign in again.
 */
export async function GET(request: NextRequest): Promise<never> {
  const next = request.nextUrl.searchParams.get("next");
  // Only paths of this console: never an absolute URL handed in from outside.
  const back = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const refresh = await readRefreshToken();
  const renewed = refresh ? await renewTokens(refresh) : null;
  if (renewed) {
    await storeTokens(renewed);
    redirect(back);
  }

  await clearSession();
  redirect("/login?expired=1");
}
